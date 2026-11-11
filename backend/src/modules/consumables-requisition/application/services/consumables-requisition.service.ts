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
  ConsumablesRequisitionStatus,
  FolderContextType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { isDateInPast } from '../../../../shared/utils/date-validation.util';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
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
import { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import type {
  ApprovalDecisionListener,
  ApprovalFinalDecision,
} from '../../../approvals/application/ports/approval-decision.listener';
import { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import {
  AddConsumablesRequisitionItemDto,
  CONSUMABLES_MAX_ITEMS,
  CreateConsumablesRequisitionDto,
  ListConsumablesRequisitionsDto,
  UpdateConsumablesRequisitionDto,
  UpdateConsumablesRequisitionItemDto,
} from '../dtos/consumables-requisition.dtos';

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

const REQUISITION_DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  items: {
    orderBy: { createdAt: 'asc' as const },
  },
  attachmentFolder: {
    include: {
      documents: { select: DOCUMENT_SELECT },
    },
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
 * Consumables requisition lifecycle - low-value stock requests with a
 * single HR Officer approval tier (or direct APPROVED for HR and above).
 */
@Injectable()
export class ConsumablesRequisitionService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ConsumablesRequisitionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
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
   * Creates a new DRAFT consumables requisition with no line items yet.
   */
  async createDraft(
    dto: CreateConsumablesRequisitionDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    const created = await this.findOrCreateDraftRequisition(
      employeeId,
      dto,
      companyId,
      userId,
      true,
    );
    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'CONSUMABLES_REQUISITION',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId: created.id,
      autoApproveTier: dto.autoApproveTier,
    });
    return this.getRequisition(created.id, companyId, userId);
  }

  /**
   * Finds a DRAFT requisition for employee+title or creates one (HR may act on behalf).
   */
  async findOrCreateDraftRequisition(
    employeeId: string,
    dto: CreateConsumablesRequisitionDto,
    companyId: string,
    actorUserId: string,
    forceCreate = false,
  ): Promise<{ id: string }> {
    const trimmedTitle = dto.title.trim();
    const trimmedPurpose = dto.purpose.trim();
    if (!trimmedTitle) {
      throw new BadRequestException('title is required');
    }
    if (!trimmedPurpose) {
      throw new BadRequestException('purpose is required');
    }

    await this.assertCanManageRequisition(
      { employeeId, createdBy: actorUserId },
      companyId,
      actorUserId,
    );

    if (!forceCreate) {
      const existing = await this.prisma.consumablesRequisition.findFirst({
        where: activeOnly({
          companyId,
          employeeId,
          status: ConsumablesRequisitionStatus.DRAFT,
          title: { equals: trimmedTitle, mode: 'insensitive' as const },
        }),
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return existing;
      }
    }

    const requestNumber = await this.nextRequestNumber();
    const department = await this.resolveEmployeeDepartment(
      employeeId,
      companyId,
    );
    const requisition = await this.prisma.consumablesRequisition.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber,
        employeeId,
        title: trimmedTitle,
        purpose: trimmedPurpose,
        requiredByDate: dto.requiredByDate
          ? this.parseRequiredByDate(dto.requiredByDate)
          : null,
        department,
        declarationConfirmed: dto.declarationConfirmed ?? false,
        status: ConsumablesRequisitionStatus.DRAFT,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      select: { id: true },
    });
    return requisition;
  }

  /**
   * Requester's org department name - the requisition's department is never client-supplied.
   */
  private async resolveEmployeeDepartment(
    employeeId: string,
    companyId: string,
  ): Promise<string | null> {
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, companyId },
      select: { department: { select: { name: true } } },
    });
    return employee?.department?.name ?? null;
  }

  /**
   * Updates header fields of a DRAFT or RETURNED consumables requisition.
   */
  async updateDraft(
    id: string,
    dto: UpdateConsumablesRequisitionDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEditableOwner(id, companyId, userId);

    await this.prisma.consumablesRequisition.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.purpose !== undefined ? { purpose: dto.purpose.trim() } : {}),
        ...(dto.requiredByDate !== undefined
          ? {
              requiredByDate: dto.requiredByDate
                ? this.parseRequiredByDate(dto.requiredByDate)
                : null,
            }
          : {}),
        ...(dto.declarationConfirmed !== undefined
          ? { declarationConfirmed: dto.declarationConfirmed }
          : {}),
        updatedBy: userId,
      },
    });

    return this.getRequisition(id, companyId, userId);
  }

  /**
   * Adds a line item (max 20) to a DRAFT or RETURNED consumables requisition.
   */
  async addItem(
    requisitionId: string,
    dto: AddConsumablesRequisitionItemDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEditableOwner(requisitionId, companyId, userId);

    const itemCount = await this.prisma.consumablesRequisitionItem.count({
      where: { requisitionId },
    });
    if (itemCount >= CONSUMABLES_MAX_ITEMS) {
      throw new BadRequestException(
        `Maximum ${CONSUMABLES_MAX_ITEMS} items per requisition`,
      );
    }

    await this.prisma.consumablesRequisitionItem.create({
      data: {
        id: randomUUID(),
        requisitionId,
        itemName: dto.itemName.trim(),
        itemCode: dto.itemCode?.trim() || null,
        modelSpec: dto.modelSpec?.trim() || null,
        description: dto.description?.trim() ?? null,
        quantity: new Prisma.Decimal(dto.quantity),
        unit: dto.unit.trim(),
      },
    });

    return this.getRequisition(requisitionId, companyId, userId);
  }

  /**
   * Updates a line item on a DRAFT or RETURNED consumables requisition.
   */
  async updateItem(
    requisitionId: string,
    itemId: string,
    dto: UpdateConsumablesRequisitionItemDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEditableOwner(requisitionId, companyId, userId);

    const existing = await this.prisma.consumablesRequisitionItem.findFirst({
      where: { id: itemId, requisitionId },
    });
    if (!existing) {
      throw new NotFoundException('Consumables requisition item not found');
    }

    const nextQuantity =
      dto.quantity !== undefined
        ? dto.quantity
        : Number(existing.quantity);

    await this.prisma.consumablesRequisitionItem.update({
      where: { id: itemId },
      data: {
        itemName:
          dto.itemName !== undefined ? dto.itemName.trim() : existing.itemName,
        itemCode:
          dto.itemCode !== undefined
            ? dto.itemCode?.trim() || null
            : existing.itemCode,
        modelSpec:
          dto.modelSpec !== undefined
            ? dto.modelSpec?.trim() || null
            : existing.modelSpec,
        description:
          dto.description !== undefined
            ? dto.description?.trim() ?? null
            : existing.description,
        quantity: new Prisma.Decimal(nextQuantity),
        unit: dto.unit !== undefined ? dto.unit.trim() : existing.unit,
      },
    });

    return this.getRequisition(requisitionId, companyId, userId);
  }

  /**
   * Removes a line item from a DRAFT or RETURNED consumables requisition.
   */
  async deleteItem(
    requisitionId: string,
    itemId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEditableOwner(requisitionId, companyId, userId);

    const existing = await this.prisma.consumablesRequisitionItem.findFirst({
      where: { id: itemId, requisitionId },
    });
    if (!existing) {
      throw new NotFoundException('Consumables requisition item not found');
    }

    await this.prisma.consumablesRequisitionItem.delete({
      where: { id: itemId },
    });
    return this.getRequisition(requisitionId, companyId, userId);
  }

  /**
   * Submits a DRAFT consumables requisition.
   * HR and above → direct APPROVED. Others → single HR Officer approval tier.
   */
  async submitRequisition(
    id: string,
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const requisition = await this.prisma.consumablesRequisition.findFirst({
      where: activeOnly({ id, companyId }),
      include: { items: true },
    });
    if (!requisition) {
      throw new NotFoundException('Consumables requisition not found');
    }
    if (!(await this.onBehalfService.canActForRecord(userId, companyId, requisition))) {
      throw new ForbiddenException('Only the request owner can submit it');
    }
    if (requisition.status !== ConsumablesRequisitionStatus.DRAFT) {
      throw new BadRequestException('Only draft requisitions can be submitted');
    }
    if (!requisition.declarationConfirmed) {
      throw new BadRequestException(
        'Confirm the low-value consumables declaration before submitting',
      );
    }
    if (requisition.items.length === 0) {
      throw new BadRequestException(
        'Add at least one item before submitting',
      );
    }
    if (requisition.items.length > CONSUMABLES_MAX_ITEMS) {
      throw new BadRequestException(
        `Maximum ${CONSUMABLES_MAX_ITEMS} items per requisition`,
      );
    }

    const resolvedTiers =
      await this.hrApprovalChain.buildConsumablesApprovalChain(
        requisition.employeeId,
        companyId,
      );

    const now = new Date();

    if (resolvedTiers.length === 0) {
      if (files?.length > 0) {
        await this.uploadRequisitionFiles(
          requisition,
          files,
          companyId,
          userId,
        );
      }

      await this.prisma.consumablesRequisition.update({
        where: { id },
        data: {
          status: ConsumablesRequisitionStatus.APPROVED,
          submittedAt: now,
          completedAt: now,
          updatedBy: userId,
        },
      });
      this.logger.log(
        `Consumables requisition ${requisition.requestNumber} auto-approved (HR+ submitter)`,
      );
      return this.getRequisition(id, companyId, userId);
    }

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'CONSUMABLES_REQUISITION',
        title: requisition.title,
        formData: {
          purpose: requisition.purpose,
          department: requisition.department,
          itemCount: requisition.items.length,
          declarationConfirmed: true,
        },
      },
      companyId,
      requisition.employeeId,
      {
        resolvedTiers: {
          ruleName: 'Consumables HR Officer chain',
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
      },
    )) as { id: string; requestNumber: string };

    if (files?.length > 0) {
      await this.uploadRequisitionFiles(
        requisition,
        files,
        companyId,
        userId,
      );
    }

    await this.prisma.consumablesRequisition.update({
      where: { id },
      data: {
        status: ConsumablesRequisitionStatus.SUBMITTED,
        approvalRequestId: approval.id,
        submittedAt: now,
        completedAt: null,
        updatedBy: userId,
      },
    });

    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'CONSUMABLES_REQUISITION',
      companyId,
      actorUserId: userId,
      employeeId: requisition.employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: await this.onBehalfService.wasAutoApproveRequested(
        'CONSUMABLES_REQUISITION',
        id,
        userId,
        companyId,
      ),
    });

    return this.getRequisition(id, companyId, userId);
  }

  /**
   * Fetches a single consumables requisition with items and approval tiers.
   */
  async getRequisition(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const requisition = await this.prisma.consumablesRequisition.findFirst({
      where: activeOnly({ id, companyId }),
      include: REQUISITION_DETAIL_INCLUDE,
    });
    if (!requisition) {
      throw new NotFoundException('Consumables requisition not found');
    }

    await this.assertCanView(requisition, companyId, userId);

    const pendingTier = requisition.approvalRequest?.tiers.find(
      (t) =>
        t.tierOrder === requisition.approvalRequest?.currentTier &&
        t.decision === 'PENDING',
    );

    const { attachmentFolder, ...rest } = requisition;

    return {
      ...rest,
      itemCount: requisition.items.length,
      currentTierLabel: pendingTier?.label ?? null,
      directApproved:
        requisition.status === ConsumablesRequisitionStatus.APPROVED &&
        !requisition.approvalRequestId,
      documents: attachmentFolder?.documents ?? [],
      attachmentFolderId: attachmentFolder?.id ?? requisition.attachmentFolderId,
    };
  }

  /**
   * Paginated list. HR viewers see company-wide; others see their own.
   */
  async listRequisitions(
    filters: ListConsumablesRequisitionsDto,
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
      'consumables',
      'manage',
    );

    const where: Prisma.ConsumablesRequisitionWhereInput = {
      companyId,
      deletedAt: null,
      ...(canManage ? {} : { employeeId: userId }),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(canManage && filters.employeeId
        ? { employeeId: filters.employeeId }
        : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              {
                requestNumber: {
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
              {
                department: {
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
      this.prisma.consumablesRequisition.findMany({
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
      this.prisma.consumablesRequisition.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => {
        const { _count, approvalRequest, ...rest } = row;
        const pendingTier = approvalRequest?.tiers[0];
        return {
          ...rest,
          approvalRequest,
          itemCount: _count.items,
          currentTierLabel: pendingTier?.label ?? null,
          directApproved:
            rest.status === ConsumablesRequisitionStatus.APPROVED &&
            !rest.approvalRequestId,
        };
      }),
      total,
      page,
      limit,
    );
  }

  /**
   * Cancels a DRAFT or SUBMITTED consumables requisition. Owner only.
   */
  async cancelRequisition(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const requisition = await this.prisma.consumablesRequisition.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!requisition) {
      throw new NotFoundException('Consumables requisition not found');
    }
    if (requisition.employeeId !== userId) {
      throw new ForbiddenException('Only the request owner can cancel it');
    }
    if (
      requisition.status !== ConsumablesRequisitionStatus.DRAFT &&
      requisition.status !== ConsumablesRequisitionStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted requisitions can be cancelled',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.consumablesRequisition.update({
        where: { id },
        data: {
          status: ConsumablesRequisitionStatus.CANCELLED,
          completedAt: now,
          updatedBy: userId,
        },
      });
      if (requisition.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: requisition.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });

    return this.getRequisition(id, companyId, userId);
  }

  /**
   * Called by the approval engine when a linked request reaches a terminal decision.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const requisition = await this.prisma.consumablesRequisition.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!requisition) {
      return;
    }
    if (
      requisition.status === ConsumablesRequisitionStatus.APPROVED ||
      requisition.status === ConsumablesRequisitionStatus.REJECTED ||
      requisition.status === ConsumablesRequisitionStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    const nextStatus =
      decision === 'APPROVED'
        ? ConsumablesRequisitionStatus.APPROVED
        : decision === 'REJECTED'
          ? ConsumablesRequisitionStatus.REJECTED
          : ConsumablesRequisitionStatus.RETURNED;

    await this.prisma.consumablesRequisition.update({
      where: { id: requisition.id },
      data: {
        status: nextStatus,
        completedAt: decision === 'RETURNED' ? null : now,
        updatedBy: requisition.employeeId,
      },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertCanManageRequisition(
    record: { employeeId: string; createdBy: string },
    companyId: string,
    userId: string,
  ): Promise<void> {
    if (await this.onBehalfService.canActForRecord(userId, companyId, record)) {
      return;
    }
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'consumables',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException(
        'You do not have permission to modify this consumables requisition',
      );
    }
  }

  private async assertEditableOwner(
    requisitionId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const requisition = await this.prisma.consumablesRequisition.findFirst({
      where: activeOnly({ id: requisitionId, companyId }),
      select: { id: true, employeeId: true, createdBy: true, status: true },
    });
    if (!requisition) {
      throw new NotFoundException('Consumables requisition not found');
    }
    await this.assertCanManageRequisition(requisition, companyId, userId);
    if (
      requisition.status !== ConsumablesRequisitionStatus.DRAFT &&
      requisition.status !== ConsumablesRequisitionStatus.RETURNED
    ) {
      throw new BadRequestException(
        'Only draft or returned requisitions can be edited',
      );
    }
  }

  private async assertCanView(
    requisition: {
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
      'consumables',
      'manage',
    );
    if (canManage) return;

    const isOwner =
      requisition.employeeId === userId || requisition.createdBy === userId;
    const isTierApprover =
      // Cancelled requests are hidden from the approval chain.
      requisition.status !== 'CANCELLED' &&
      (requisition.approvalRequest?.tiers?.some(
        (t) => t.approverId === userId,
      ) ?? false);

    if (!isOwner && !isTierApprover) {
      throw new ForbiddenException(
        'You do not have access to this consumables requisition',
      );
    }
  }

  private async uploadRequisitionFiles(
    requisition: {
      id: string;
      requestNumber: string;
      attachmentFolderId: string | null;
    },
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ): Promise<void> {
    const folderId =
      requisition.attachmentFolderId ??
      (await this.ensureAttachmentFolder(requisition, companyId, userId));

    for (const file of files) {
      if (!file?.buffer?.length) {
        continue;
      }
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(
          `File type not allowed: ${file.mimetype}`,
        );
      }

      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `${companyId}/hr/consumables/${requisition.id}/${randomUUID()}_${safeName}`;

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
    }
  }

  private async ensureAttachmentFolder(
    requisition: {
      id: string;
      requestNumber: string;
      attachmentFolderId: string | null;
    },
    companyId: string,
    userId: string,
  ): Promise<string> {
    if (requisition.attachmentFolderId) {
      return requisition.attachmentFolderId;
    }

    const folderId = randomUUID();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.documentFolder.create({
        data: {
          id: folderId,
          companyId,
          name: `Consumables ${requisition.requestNumber}`,
          path: `/hr/consumables/${requisition.requestNumber}`,
          contextType: FolderContextType.CONSUMABLES_REQUISITION,
          contextId: requisition.id,
          isSystem: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.consumablesRequisition.update({
        where: { id: requisition.id },
        data: { attachmentFolderId: folderId, updatedBy: userId },
      });
    });

    return folderId;
  }

  private normalizeStatuses(
    status: string | undefined,
  ): ConsumablesRequisitionStatus[] | undefined {
    if (!status) return undefined;
    if (status.includes(',')) {
      return status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as ConsumablesRequisitionStatus[];
    }
    return [status as ConsumablesRequisitionStatus];
  }

  /** Required-by dates must be today or later (company timezone). */
  private parseRequiredByDate(value: string): Date {
    const date = this.parseDateOnly(value);
    if (isDateInPast(date)) {
      throw new BadRequestException(
        'Required by date must be today or in the future',
      );
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

  private async nextRequestNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('consumables_requisition_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `LCR-${String(seq).padStart(4, '0')}`;
  }
}
