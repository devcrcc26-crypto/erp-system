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
  FolderContextType,
  MaterialRequisitionStatus,
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
  AddMaterialRequisitionItemDto,
  CreateMaterialRequisitionDto,
  ListMaterialRequisitionsDto,
  UpdateMaterialRequisitionDto,
  UpdateMaterialRequisitionItemDto,
} from '../dtos/material-requisition.dtos';

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
  project: { select: { id: true, name: true, projectCode: true } },
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
 * Material requisition lifecycle - warehouse stock requests with a fixed
 * Discipline Lead → HR Officer → General Manager approval chain.
 */
@Injectable()
export class MaterialRequisitionService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MaterialRequisitionService.name);

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
   * Creates a new DRAFT material requisition with no line items yet.
   */
  async createDraft(
    dto: CreateMaterialRequisitionDto,
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
      moduleCode: 'MATERIAL_REQUISITION',
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
    dto: CreateMaterialRequisitionDto,
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

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: activeOnly({ id: dto.projectId, companyId }),
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
    }

    if (!forceCreate) {
      const existing = await this.prisma.materialRequisition.findFirst({
        where: activeOnly({
          companyId,
          employeeId,
          status: MaterialRequisitionStatus.DRAFT,
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
    const requisition = await this.prisma.materialRequisition.create({
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
        projectId: dto.projectId ?? null,
        warehouseLocation: dto.warehouseLocation?.trim() ?? null,
        status: MaterialRequisitionStatus.DRAFT,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      select: { id: true },
    });
    return requisition;
  }

  /**
   * Updates header fields of a DRAFT or RETURNED material requisition.
   */
  async updateDraft(
    id: string,
    dto: UpdateMaterialRequisitionDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEditableOwner(id, companyId, userId);

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: activeOnly({ id: dto.projectId, companyId }),
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
    }

    await this.prisma.materialRequisition.update({
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
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
        ...(dto.warehouseLocation !== undefined
          ? { warehouseLocation: dto.warehouseLocation?.trim() ?? null }
          : {}),
        updatedBy: userId,
      },
    });

    const updated = await this.prisma.materialRequisition.findFirstOrThrow({
      where: { id },
      include: { items: { select: { id: true } } },
    });
    if (updated.approvalRequestId) {
      // Keep the approval card in step with the edited requisition.
      await this.prisma.approvalRequest.update({
        where: { id: updated.approvalRequestId },
        data: {
          title: updated.title,
          formData: {
            purpose: updated.purpose,
            itemCount: updated.items.length,
            warehouseLocation: updated.warehouseLocation,
          },
          updatedBy: userId,
        },
      });
    }

    return this.getRequisition(id, companyId, userId);
  }

  /**
   * Adds a line item to a DRAFT or RETURNED material requisition.
   */
  async addItem(
    requisitionId: string,
    dto: AddMaterialRequisitionItemDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEditableOwner(requisitionId, companyId, userId);

    await this.prisma.materialRequisitionItem.create({
      data: {
        id: randomUUID(),
        requisitionId,
        itemName: dto.itemName.trim(),
        itemCode: dto.itemCode?.trim() || null,
        description: dto.description?.trim() ?? null,
        quantity: new Prisma.Decimal(dto.quantity),
        unit: dto.unit.trim(),
      },
    });

    return this.getRequisition(requisitionId, companyId, userId);
  }

  /**
   * Updates a line item on a DRAFT or RETURNED material requisition.
   */
  async updateItem(
    requisitionId: string,
    itemId: string,
    dto: UpdateMaterialRequisitionItemDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEditableOwner(requisitionId, companyId, userId);

    const existing = await this.prisma.materialRequisitionItem.findFirst({
      where: { id: itemId, requisitionId },
    });
    if (!existing) {
      throw new NotFoundException('Material requisition item not found');
    }

    await this.prisma.materialRequisitionItem.update({
      where: { id: itemId },
      data: {
        itemName:
          dto.itemName !== undefined ? dto.itemName.trim() : existing.itemName,
        itemCode:
          dto.itemCode !== undefined
            ? dto.itemCode?.trim() || null
            : existing.itemCode,
        description:
          dto.description !== undefined
            ? dto.description?.trim() ?? null
            : existing.description,
        quantity:
          dto.quantity !== undefined
            ? new Prisma.Decimal(dto.quantity)
            : existing.quantity,
        unit: dto.unit !== undefined ? dto.unit.trim() : existing.unit,
      },
    });

    return this.getRequisition(requisitionId, companyId, userId);
  }

  /**
   * Removes a line item from a DRAFT or RETURNED material requisition.
   */
  async deleteItem(
    requisitionId: string,
    itemId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEditableOwner(requisitionId, companyId, userId);

    const existing = await this.prisma.materialRequisitionItem.findFirst({
      where: { id: itemId, requisitionId },
    });
    if (!existing) {
      throw new NotFoundException('Material requisition item not found');
    }

    await this.prisma.materialRequisitionItem.delete({ where: { id: itemId } });
    return this.getRequisition(requisitionId, companyId, userId);
  }

  /**
   * Submits a DRAFT material requisition for approval.
   * Always opens Discipline Lead → HR → GM (duplicates collapsed).
   * Returned requisitions are resubmitted via the Approvals request
   * (Resubmit), after any edits.
   */
  async submitRequisition(
    id: string,
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const requisition = await this.prisma.materialRequisition.findFirst({
      where: activeOnly({ id, companyId }),
      include: { items: true },
    });
    if (!requisition) {
      throw new NotFoundException('Material requisition not found');
    }
    if (!(await this.onBehalfService.canActForRecord(userId, companyId, requisition))) {
      throw new ForbiddenException('Only the request owner can submit it');
    }
    if (requisition.status !== MaterialRequisitionStatus.DRAFT) {
      throw new BadRequestException('Only draft requisitions can be submitted');
    }
    if (requisition.items.length === 0) {
      throw new BadRequestException(
        'Add at least one item before submitting',
      );
    }

    const resolvedTiers =
      await this.hrApprovalChain.buildMaterialRequisitionApprovalChain(
        requisition.employeeId,
        companyId,
      );

    if (resolvedTiers.length === 0) {
      if (files?.length > 0) {
        await this.uploadRequisitionFiles(
          requisition,
          files,
          companyId,
          userId,
        );
      }

      const now = new Date();
      await this.prisma.materialRequisition.update({
        where: { id },
        data: {
          status: MaterialRequisitionStatus.APPROVED,
          submittedAt: now,
          completedAt: now,
          updatedBy: userId,
        },
      });

      this.logger.log(
        `Material requisition ${requisition.requestNumber} auto-approved (no further tiers)`,
      );

      return this.getRequisition(id, companyId, userId);
    }

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'MATERIAL_REQUISITION',
        title: requisition.title,
        formData: {
          purpose: requisition.purpose,
          itemCount: requisition.items.length,
          warehouseLocation: requisition.warehouseLocation,
        },
      },
      companyId,
      requisition.employeeId,
      {
        resolvedTiers: {
          ruleName: 'Material requisition org chain',
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

    await this.prisma.materialRequisition.update({
      where: { id },
      data: {
        status: MaterialRequisitionStatus.SUBMITTED,
        approvalRequestId: approval.id,
        submittedAt: new Date(),
        completedAt: null,
        updatedBy: userId,
      },
    });

    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'MATERIAL_REQUISITION',
      companyId,
      actorUserId: userId,
      employeeId: requisition.employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: await this.onBehalfService.wasAutoApproveRequested(
        'MATERIAL_REQUISITION',
        id,
        userId,
        companyId,
      ),
    });

    return this.getRequisition(id, companyId, userId);
  }

  /**
   * Fetches a single material requisition with items and approval tiers.
   */
  async getRequisition(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const requisition = await this.prisma.materialRequisition.findFirst({
      where: activeOnly({ id, companyId }),
      include: REQUISITION_DETAIL_INCLUDE,
    });
    if (!requisition) {
      throw new NotFoundException('Material requisition not found');
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
      documents: attachmentFolder?.documents ?? [],
      attachmentFolderId: attachmentFolder?.id ?? requisition.attachmentFolderId,
    };
  }

  /**
   * Paginated list. HR viewers see company-wide; others see their own.
   */
  async listRequisitions(
    filters: ListMaterialRequisitionsDto,
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
      'material-requisition',
      'manage',
    );

    const where: Prisma.MaterialRequisitionWhereInput = {
      companyId,
      deletedAt: null,
      ...(canManage ? {} : { employeeId: userId }),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(canManage && filters.employeeId
        ? { employeeId: filters.employeeId }
        : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
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
      this.prisma.materialRequisition.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: USER_SELECT },
          project: { select: { id: true, name: true, projectCode: true } },
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
      this.prisma.materialRequisition.count({ where }),
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
        };
      }),
      total,
      page,
      limit,
    );
  }

  /**
   * Cancels a DRAFT or SUBMITTED material requisition. Only the owner may cancel.
   */
  async cancelRequisition(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const requisition = await this.prisma.materialRequisition.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!requisition) {
      throw new NotFoundException('Material requisition not found');
    }
    if (requisition.employeeId !== userId) {
      throw new ForbiddenException('Only the request owner can cancel it');
    }
    if (
      requisition.status !== MaterialRequisitionStatus.DRAFT &&
      requisition.status !== MaterialRequisitionStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted requisitions can be cancelled',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.materialRequisition.update({
        where: { id },
        data: {
          status: MaterialRequisitionStatus.CANCELLED,
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
    const requisition = await this.prisma.materialRequisition.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!requisition) {
      return;
    }
    if (
      requisition.status === MaterialRequisitionStatus.APPROVED ||
      requisition.status === MaterialRequisitionStatus.REJECTED ||
      requisition.status === MaterialRequisitionStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    const nextStatus =
      decision === 'APPROVED'
        ? MaterialRequisitionStatus.APPROVED
        : decision === 'REJECTED'
          ? MaterialRequisitionStatus.REJECTED
          : MaterialRequisitionStatus.RETURNED;

    await this.prisma.materialRequisition.update({
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
      'material-requisition',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException(
        'You do not have permission to modify this material requisition',
      );
    }
  }

  private async assertEditableOwner(
    requisitionId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const requisition = await this.prisma.materialRequisition.findFirst({
      where: activeOnly({ id: requisitionId, companyId }),
      select: { id: true, employeeId: true, createdBy: true, status: true },
    });
    if (!requisition) {
      throw new NotFoundException('Material requisition not found');
    }
    await this.assertCanManageRequisition(requisition, companyId, userId);
    if (
      requisition.status !== MaterialRequisitionStatus.DRAFT &&
      requisition.status !== MaterialRequisitionStatus.RETURNED
    ) {
      throw new ForbiddenException('This request can no longer be edited.');
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
      'material-requisition',
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
        'You do not have access to this material requisition',
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
      const fileKey = `${companyId}/hr/material-requisition/${requisition.id}/${randomUUID()}_${safeName}`;

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
          name: `Material Requisition ${requisition.requestNumber}`,
          path: `/hr/material-requisition/${requisition.requestNumber}`,
          contextType: FolderContextType.MATERIAL_REQUISITION,
          contextId: requisition.id,
          isSystem: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.materialRequisition.update({
        where: { id: requisition.id },
        data: { attachmentFolderId: folderId, updatedBy: userId },
      });
    });

    return folderId;
  }

  private normalizeStatuses(
    status: string | undefined,
  ): MaterialRequisitionStatus[] | undefined {
    if (!status) return undefined;
    if (status.includes(',')) {
      return status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as MaterialRequisitionStatus[];
    }
    return [status as MaterialRequisitionStatus];
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
      SELECT nextval('material_requisition_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `MR-${String(seq).padStart(4, '0')}`;
  }
}
