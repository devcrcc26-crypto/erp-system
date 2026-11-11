import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ApprovalRequestStatus,
  ExpenseClaimStatus,
  FolderContextType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { isDateInFuture } from '../../../../shared/utils/date-validation.util';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { assertWithinEmploymentWindow } from '../../../../shared/employment/employment-guard.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  STORAGE_BUCKETS,
  STORAGE_SERVICE,
} from '../../../../shared/storage/storage.constants';
import type { IStorageService } from '../../../../shared/storage/storage.interface';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { CurrencyService } from '../../../../shared/currency/currency.service';
import { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import type {
  ApprovalDecisionListener,
  ApprovalFinalDecision,
} from '../../../approvals/application/ports/approval-decision.listener';
import { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import {
  canViewThroughTeam,
  resolveTeamScopedEmployeeIds,
  teamScopeWhere,
} from '../../../../shared/org/team-scope.util';
import {
  AddExpenseClaimItemDto,
  CreateExpenseClaimDto,
  ListExpenseClaimsDto,
  MarkExpenseClaimPaidDto,
  UpdateExpenseClaimDto,
  UpdateExpenseClaimItemDto,
} from '../dtos/expense-claim.dtos';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

const DOCUMENT_SELECT = {
  id: true,
  name: true,
  fileType: true,
  fileSizeBytes: true,
} as const;

const CLAIM_DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  paidBy: { select: USER_SELECT },
  items: {
    include: {
      receipts: {
        include: { document: { select: DOCUMENT_SELECT } },
        orderBy: { createdAt: 'asc' as const },
      },
    },
    orderBy: { expenseDate: 'asc' as const },
  },
  approvalRequest: {
    include: {
      tiers: {
        include: { approver: { select: USER_SELECT } },
        orderBy: { tierOrder: 'asc' as const },
      },
    },
  },
} as const;

/**
 * Expense claim lifecycle - owns claim/item data; delegates tier workflow to ApprovalsService.
 */
@Injectable()
export class ExpenseClaimService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExpenseClaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
    private readonly currencyService: CurrencyService,
    private readonly onBehalfService: OnBehalfService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: IStorageService,
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  /**
   * Creates a new DRAFT claim with no line items yet (optionally on behalf of an employee).
   */
  async createDraft(
    dto: CreateExpenseClaimDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    const created = await this.findOrCreateDraftClaim(
      employeeId,
      dto.title,
      dto.description,
      companyId,
      userId,
      true,
    );
    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'EXPENSE_CLAIM',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId: created.id,
      autoApproveTier: dto.autoApproveTier,
    });
    return this.getClaim(created.id, companyId, userId);
  }

  /**
   * Finds a DRAFT claim for employee+title or creates one (HR may act on behalf).
   */
  async findOrCreateDraftClaim(
    employeeId: string,
    title: string,
    claimDescription: string | undefined,
    companyId: string,
    actorUserId: string,
    forceCreate = false,
  ): Promise<{ id: string }> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      throw new BadRequestException('title is required');
    }

    if (employeeId !== actorUserId) {
      await this.assertCanManageClaim(
        { employeeId, createdBy: actorUserId },
        companyId,
        actorUserId,
      );
    }

    if (!forceCreate) {
      const existing = await this.prisma.expenseClaim.findFirst({
        where: activeOnly({
          companyId,
          employeeId,
          status: ExpenseClaimStatus.DRAFT,
          title: {
            equals: trimmedTitle,
            mode: 'insensitive' as const,
          },
        }),
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return existing;
      }
    }

    const claimNumber = await this.nextClaimNumber();
    const claim = await this.prisma.expenseClaim.create({
      data: {
        id: randomUUID(),
        companyId,
        claimNumber,
        employeeId,
        title: trimmedTitle,
        description: claimDescription?.trim() || null,
        status: ExpenseClaimStatus.DRAFT,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      select: { id: true },
    });
    return claim;
  }

  /**
   * Adds a line item to a DRAFT / RETURNED claim. Every uploaded file becomes a
   * receipt of this one item (never one item per file).
   */
  async addItem(
    claimId: string,
    dto: AddExpenseClaimItemDto,
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const claim = await this.assertDraftOwner(claimId, companyId, userId);
    const expenseDate = this.parseExpenseDate(dto.expenseDate);

    const rate =
      dto.currency === 'ETB'
        ? 1
        : await this.currencyService.getRate(dto.currency, 'ETB', companyId);
    const amountEtb = dto.amount * rate;

    const documentIds = await this.uploadReceipts(claim, companyId, userId, files);

    await this.prisma.expenseClaimItem.create({
      data: {
        id: randomUUID(),
        claimId,
        category: dto.category.trim(),
        description: dto.description.trim(),
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency,
        amountEtb: new Prisma.Decimal(amountEtb),
        exchangeRate: new Prisma.Decimal(rate),
        expenseDate,
        receipts: {
          create: documentIds.map((documentId) => ({ documentId })),
        },
      },
    });

    await this.recomputeTotal(claimId, userId);
    return this.getClaim(claimId, companyId, userId);
  }

  /**
   * Updates a line item's fields. When files are uploaded they replace the
   * item's receipts (all files sent together are kept on this one item).
   */
  async updateItem(
    claimId: string,
    itemId: string,
    dto: UpdateExpenseClaimItemDto,
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const claim = await this.assertDraftOwner(claimId, companyId, userId);

    const existing = await this.prisma.expenseClaimItem.findFirst({
      where: { id: itemId, claimId },
    });
    if (!existing) {
      throw new NotFoundException('Expense claim item not found');
    }
    const nextExpenseDate = dto.expenseDate
      ? this.parseExpenseDate(dto.expenseDate)
      : existing.expenseDate;

    const nextCurrency = dto.currency ?? existing.currency;
    const nextAmount = dto.amount ?? Number(existing.amount);
    const rate =
      nextCurrency === 'ETB'
        ? 1
        : await this.currencyService.getRate(nextCurrency, 'ETB', companyId);
    const amountEtb = nextAmount * rate;

    const documentIds = await this.uploadReceipts(claim, companyId, userId, files);

    await this.prisma.expenseClaimItem.update({
      where: { id: itemId },
      data: {
        category: dto.category?.trim() ?? existing.category,
        description: dto.description?.trim() ?? existing.description,
        amount: new Prisma.Decimal(nextAmount),
        currency: nextCurrency,
        amountEtb: new Prisma.Decimal(amountEtb),
        exchangeRate: new Prisma.Decimal(rate),
        expenseDate: nextExpenseDate,
        ...(documentIds.length > 0
          ? {
              receipts: {
                deleteMany: {},
                create: documentIds.map((documentId) => ({ documentId })),
              },
            }
          : {}),
      },
    });

    await this.recomputeTotal(claimId, userId);
    return this.getClaim(claimId, companyId, userId);
  }

  /**
   * Removes a line item from a DRAFT claim.
   */
  async deleteItem(
    claimId: string,
    itemId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertDraftOwner(claimId, companyId, userId);

    const existing = await this.prisma.expenseClaimItem.findFirst({
      where: { id: itemId, claimId },
    });
    if (!existing) {
      throw new NotFoundException('Expense claim item not found');
    }

    await this.prisma.expenseClaimItem.delete({ where: { id: itemId } });
    await this.recomputeTotal(claimId, userId);
    return this.getClaim(claimId, companyId, userId);
  }

  /**
   * Submits a DRAFT claim for approval. Requires at least one item, all with a receipt.
   */
  async submitClaim(
    claimId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: activeOnly({ id: claimId, companyId }),
      include: { items: { include: { receipts: { select: { id: true } } } } },
    });
    if (!claim) {
      throw new NotFoundException('Expense claim not found');
    }
    if (!(await this.onBehalfService.canActForRecord(userId, companyId, claim))) {
      throw new ForbiddenException('Only the claim owner can submit it');
    }
    if (claim.status !== ExpenseClaimStatus.DRAFT) {
      throw new BadRequestException('Only draft claims can be submitted');
    }
    if (claim.items.length === 0) {
      throw new BadRequestException(
        'Add at least one expense item before submitting',
      );
    }
    const missingReceipt = claim.items.some((item) => item.receipts.length === 0);
    if (missingReceipt) {
      throw new BadRequestException(
        'Every expense item requires a receipt before submitting',
      );
    }
    await assertWithinEmploymentWindow(
      this.prisma,
      claim.employeeId,
      claim.items.map((item) => item.expenseDate),
    );

    const resolvedTiers = await this.hrApprovalChain.buildOrgApprovalChain(
      claim.employeeId,
      companyId,
      true,
    );

    if (resolvedTiers.length === 0) {
      const now = new Date();
      await this.prisma.expenseClaim.update({
        where: { id: claimId },
        data: {
          status: ExpenseClaimStatus.APPROVED,
          submittedAt: now,
          completedAt: now,
          updatedBy: userId,
        },
      });
      this.logger.log(
        `Expense claim ${claim.claimNumber} auto-approved (no further tiers)`,
      );
      return this.getClaim(claimId, companyId, userId);
    }

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'EXPENSE_CLAIM',
        title: claim.title,
        formData: {
          description: claim.description,
          itemCount: claim.items.length,
          totalAmountEtb: Number(claim.totalAmountEtb),
        },
      },
      companyId,
      claim.employeeId,
      {
        resolvedTiers: {
          ruleName: 'Expense claim org chain',
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
      },
    )) as { id: string; requestNumber: string };

    await this.prisma.expenseClaim.update({
      where: { id: claimId },
      data: {
        status: ExpenseClaimStatus.SUBMITTED,
        approvalRequestId: approval.id,
        submittedAt: new Date(),
        updatedBy: userId,
      },
    });

    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'EXPENSE_CLAIM',
      companyId,
      actorUserId: userId,
      employeeId: claim.employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: await this.onBehalfService.wasAutoApproveRequested(
        'EXPENSE_CLAIM',
        claimId,
        userId,
        companyId,
      ),
    });

    return this.getClaim(claimId, companyId, userId);
  }

  /**
   * Fetches a single claim with items and approval tiers.
   */
  async getClaim(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: activeOnly({ id, companyId }),
      include: CLAIM_DETAIL_INCLUDE,
    });
    if (!claim) {
      throw new NotFoundException('Expense claim not found');
    }

    await this.assertCanView(claim, companyId, userId);

    return {
      ...claim,
      itemCount: claim.items.length,
    };
  }

  /**
   * Paginated claims. HR viewers see company-wide; others see their own.
   */
  async listClaims(
    filters: ListExpenseClaimsDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);
    const statuses = this.normalizeStatuses(filters.status);

    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'expense-claim',
      'manage',
    );

    const teamEmployeeIds = canManage
      ? null
      : await resolveTeamScopedEmployeeIds(this.prisma, userId, companyId);

    const where: Prisma.ExpenseClaimWhereInput = {
      companyId,
      deletedAt: null,
      // Own records plus the team's (not their drafts or cancelled ones).
      ...(teamEmployeeIds
        ? { AND: [teamScopeWhere(userId, teamEmployeeIds, filters.employeeId)] }
        : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(canManage && filters.employeeId
        ? { employeeId: filters.employeeId }
        : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              {
                claimNumber: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                title: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom
                ? { gte: this.parseDateOnly(filters.dateFrom) }
                : {}),
              ...(filters.dateTo
                ? { lte: this.parseDateOnly(filters.dateTo) }
                : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.expenseClaim.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: USER_SELECT },
          _count: { select: { items: true } },
          approvalRequest: {
            select: {
              id: true,
              status: true,
              currentTier: true,
              tiers: {
                where: { decision: 'PENDING' },
                take: 1,
                select: { tierOrder: true, label: true },
              },
            },
          },
        },
      }),
      this.prisma.expenseClaim.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => {
        const { _count, ...rest } = row;
        return { ...rest, itemCount: _count.items };
      }),
      total,
      page,
      limit,
    );
  }

  /**
   * Updates claim header fields on a DRAFT or RETURNED claim.
   * Owner or HR (hr.view) may edit.
   */
  async updateClaim(
    id: string,
    dto: UpdateExpenseClaimDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: activeOnly({ id, companyId }),
      include: { items: true },
    });
    if (!claim) {
      throw new NotFoundException('Expense claim not found');
    }
    await this.assertCanManageClaim(claim, companyId, userId);
    if (
      claim.status !== ExpenseClaimStatus.DRAFT &&
      claim.status !== ExpenseClaimStatus.RETURNED
    ) {
      throw new ForbiddenException('This request can no longer be edited.');
    }
    if (dto.title === undefined && dto.description === undefined) {
      throw new BadRequestException('No fields to update');
    }

    const title =
      dto.title !== undefined ? dto.title.trim() : claim.title;
    const description =
      dto.description !== undefined
        ? dto.description.trim() || null
        : claim.description;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.expenseClaim.update({
        where: { id: claim.id },
        data: { title, description, updatedBy: userId },
      });
      if (claim.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: claim.approvalRequestId },
          data: {
            title,
            formData: {
              description,
              itemCount: claim.items.length,
              totalAmountEtb: Number(claim.totalAmountEtb),
            },
            updatedBy: userId,
          },
        });
      }
    });

    return this.getClaim(id, companyId, userId);
  }

  /**
   * Soft-deletes an expense claim (HR only) and cancels any linked approval.
   */
  async deleteClaim(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!claim) {
      throw new NotFoundException('Expense claim not found');
    }

    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'expense-claim',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException('Only HR can delete expense claims');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.expenseClaim.update({
        where: { id: claim.id },
        data: {
          deletedAt: now,
          deletedBy: userId,
          updatedBy: userId,
        },
      });
      if (claim.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: claim.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });
  }

  /**
   * Cancels a DRAFT or SUBMITTED claim. Only the owner may cancel.
   */
  async cancelClaim(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!claim) {
      throw new NotFoundException('Expense claim not found');
    }
    if (claim.employeeId !== userId) {
      throw new ForbiddenException('Only the claim owner can cancel it');
    }
    if (
      claim.status !== ExpenseClaimStatus.DRAFT &&
      claim.status !== ExpenseClaimStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted claims can be cancelled',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.expenseClaim.update({
        where: { id },
        data: {
          status: ExpenseClaimStatus.CANCELLED,
          completedAt: now,
          updatedBy: userId,
        },
      });
      if (claim.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: claim.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });

    return this.getClaim(id, companyId, userId);
  }

  /**
   * Records that an approved expense claim has been reimbursed to the employee.
   */
  async markAsPaid(
    id: string,
    dto: MarkExpenseClaimPaidDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!claim) {
      throw new NotFoundException('Expense claim not found');
    }

    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'expense-claim',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException(
        'Only HR can mark expense claims as paid',
      );
    }
    if (claim.status !== ExpenseClaimStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved expense claims can be marked as paid',
      );
    }
    if (claim.paidAt) {
      throw new BadRequestException('This expense claim is already marked as paid');
    }

    const paidAt = dto.paidDate
      ? this.parseDateOnly(dto.paidDate)
      : new Date();

    await this.prisma.expenseClaim.update({
      where: { id },
      data: {
        paidAt,
        paidById: userId,
        paymentReference: dto.paymentReference?.trim() || null,
        updatedBy: userId,
      },
    });

    return this.getClaim(id, companyId, userId);
  }

  /**
   * Called by the approval engine when a linked request reaches a terminal decision.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!claim) {
      return;
    }
    if (
      claim.status === ExpenseClaimStatus.APPROVED ||
      claim.status === ExpenseClaimStatus.REJECTED ||
      claim.status === ExpenseClaimStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    const nextStatus =
      decision === 'APPROVED'
        ? ExpenseClaimStatus.APPROVED
        : decision === 'REJECTED'
          ? ExpenseClaimStatus.REJECTED
          : ExpenseClaimStatus.RETURNED;

    await this.prisma.expenseClaim.update({
      where: { id: claim.id },
      data: {
        status: nextStatus,
        completedAt: decision === 'RETURNED' ? null : now,
        updatedBy: claim.employeeId,
      },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertCanManageClaim(
    claim: { employeeId: string; createdBy: string },
    companyId: string,
    userId: string,
  ): Promise<void> {
    if (await this.onBehalfService.canActForRecord(userId, companyId, claim)) {
      return;
    }
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'expense-claim',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException(
        'You do not have permission to modify this expense claim',
      );
    }
  }

  private async assertDraftOwner(
    claimId: string,
    companyId: string,
    userId: string,
  ): Promise<{ id: string; claimNumber: string; attachmentFolderId: string | null }> {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: activeOnly({ id: claimId, companyId }),
      select: {
        id: true,
        claimNumber: true,
        employeeId: true,
        createdBy: true,
        status: true,
        attachmentFolderId: true,
      },
    });
    if (!claim) {
      throw new NotFoundException('Expense claim not found');
    }
    await this.assertCanManageClaim(claim, companyId, userId);
    if (
      claim.status !== ExpenseClaimStatus.DRAFT &&
      claim.status !== ExpenseClaimStatus.RETURNED
    ) {
      throw new ForbiddenException('This request can no longer be edited.');
    }
    return claim;
  }

  private async assertCanView(
    claim: {
      status: string;
      employeeId: string;
      createdBy: string;
      approvalRequest?: { tiers?: Array<{ approverId: string }> } | null;
    },
    companyId: string,
    userId: string,
  ): Promise<void> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'expense-claim',
      'manage',
    );
    if (canManage) return;

    const isOwner = claim.employeeId === userId || claim.createdBy === userId;
    const isTierApprover =
      // Cancelled requests are hidden from the approval chain.
      claim.status !== 'CANCELLED' &&
      (claim.approvalRequest?.tiers?.some((t) => t.approverId === userId) ??
      false);
    const inTeamScope =
      !isOwner &&
      (await canViewThroughTeam(this.prisma, userId, companyId, claim));

    if (!isOwner && !isTierApprover && !inTeamScope) {
      throw new ForbiddenException(
        'You do not have access to this expense claim',
      );
    }
  }

  private async recomputeTotal(claimId: string, userId: string): Promise<void> {
    const items = await this.prisma.expenseClaimItem.findMany({
      where: { claimId },
      select: { amountEtb: true },
    });
    const total = items.reduce((sum, item) => sum + Number(item.amountEtb), 0);
    await this.prisma.expenseClaim.update({
      where: { id: claimId },
      data: { totalAmountEtb: new Prisma.Decimal(total), updatedBy: userId },
    });
  }

  /**
   * Uploads every file as a receipt of the same item. The claim's attachment
   * folder is resolved once so several files never create several folders.
   */
  private async uploadReceipts(
    claim: { id: string; claimNumber: string; attachmentFolderId: string | null },
    companyId: string,
    userId: string,
    files: UploadedFile[],
  ): Promise<string[]> {
    const uploads = files.filter((file) => file.buffer?.length);
    if (uploads.length === 0) {
      return [];
    }
    const withFolder = {
      ...claim,
      attachmentFolderId:
        claim.attachmentFolderId ??
        (await this.ensureAttachmentFolder(claim, companyId, userId)),
    };
    const documentIds: string[] = [];
    for (const file of uploads) {
      documentIds.push(
        await this.uploadReceipt(withFolder, companyId, userId, file),
      );
    }
    return documentIds;
  }

  private async uploadReceipt(
    claim: { id: string; claimNumber: string; attachmentFolderId: string | null },
    companyId: string,
    userId: string,
    file: UploadedFile,
  ): Promise<string> {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
    }

    const folderId =
      claim.attachmentFolderId ??
      (await this.ensureAttachmentFolder(claim, companyId, userId));

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `${companyId}/hr/expense-claim/${claim.id}/${randomUUID()}_${safeName}`;

    await this.storage.upload({
      bucket: STORAGE_BUCKETS.HR,
      key: fileKey,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
    });

    const documentId = randomUUID();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.document.create({
        data: {
          id: documentId,
          companyId,
          folderId,
          name: file.originalname,
          fileKey,
          fileType: file.mimetype,
          fileSizeBytes: file.size,
          version: 1,
          isCurrent: true,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.documentVersion.create({
        data: {
          documentId,
          uploadedBy: userId,
          versionNumber: 1,
          fileKey,
          fileSizeBytes: file.size,
        },
      });
    });

    return documentId;
  }

  private async ensureAttachmentFolder(
    claim: { id: string; claimNumber: string; attachmentFolderId: string | null },
    companyId: string,
    userId: string,
  ): Promise<string> {
    if (claim.attachmentFolderId) {
      return claim.attachmentFolderId;
    }

    const folderId = randomUUID();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.documentFolder.create({
        data: {
          id: folderId,
          companyId,
          name: `Expense Claim ${claim.claimNumber}`,
          path: `/hr/expense-claim/${claim.claimNumber}`,
          contextType: FolderContextType.EXPENSE_CLAIM,
          contextId: claim.id,
          isSystem: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.expenseClaim.update({
        where: { id: claim.id },
        data: { attachmentFolderId: folderId, updatedBy: userId },
      });
    });

    return folderId;
  }

  private normalizeStatuses(
    status: string | undefined,
  ): ExpenseClaimStatus[] | undefined {
    if (!status) return undefined;
    if (status.includes(',')) {
      return status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as ExpenseClaimStatus[];
    }
    return [status as ExpenseClaimStatus];
  }

  /** Expense dates are incurred expenses: today or earlier (company timezone). */
  private parseExpenseDate(value: string): Date {
    const date = this.parseDateOnly(value);
    if (isDateInFuture(date)) {
      throw new BadRequestException('Expense date cannot be in the future');
    }
    return date;
  }

  private parseDateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private async nextClaimNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('expense_claim_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `EC-${String(seq).padStart(4, '0')}`;
  }
}
