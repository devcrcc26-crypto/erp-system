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
  Prisma,
  PurchaseRequestStatus,
  SupportedCurrency,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { isDateInPast } from '../../../../shared/utils/date-validation.util';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  ALLOWED_IMAGE_MIME_TYPES,
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
import { PURCHASE_REQUEST_SUBMITTER_ROLES } from '../purchase-request-submitter.roles';
import {
  AddPurchaseRequestItemDto,
  CreatePurchaseRequestDto,
  ListPurchaseRequestsDto,
  UpdatePurchaseRequestDto,
  UpdatePurchaseRequestItemDto,
} from '../dtos/purchase-request.dtos';

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

const REQUEST_DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      image: { select: DOCUMENT_SELECT },
      images: {
        orderBy: { sortOrder: 'asc' as const },
        include: { document: { select: DOCUMENT_SELECT } },
      },
    },
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
 * Purchase request lifecycle - owns request/item data; delegates tier workflow to ApprovalsService.
 */
@Injectable()
export class PurchaseRequestService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PurchaseRequestService.name);

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
   * Creates a new DRAFT purchase request with no line items yet.
   */
  async createDraft(
    dto: CreatePurchaseRequestDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertPurchaseRequestSubmitter(companyId, userId);
    const onBehalfId = dto.onBehalfOfEmployeeId?.trim();
    if (onBehalfId && onBehalfId !== userId) {
      throw new ForbiddenException(
        'On-behalf submission is not allowed for purchase requests',
      );
    }
    const employeeId = userId;
    const created = await this.findOrCreateDraftRequest(
      employeeId,
      dto,
      companyId,
      userId,
      true,
    );
    return this.getRequest(created.id, companyId, userId);
  }

  /**
   * Finds a DRAFT request for employee+title or creates one (HR may act on behalf).
   */
  async findOrCreateDraftRequest(
    employeeId: string,
    dto: CreatePurchaseRequestDto,
    companyId: string,
    actorUserId: string,
    forceCreate = false,
  ): Promise<{ id: string }> {
    const trimmedTitle = dto.title.trim();
    const trimmedJustification = dto.justification.trim();
    if (!trimmedTitle) {
      throw new BadRequestException('title is required');
    }
    if (!trimmedJustification) {
      throw new BadRequestException('justification is required');
    }

    await this.assertCanManageRequest(
      { employeeId, createdBy: actorUserId },
      companyId,
      actorUserId,
    );

    if (!forceCreate) {
      const existing = await this.prisma.purchaseRequest.findFirst({
        where: activeOnly({
          companyId,
          employeeId,
          status: PurchaseRequestStatus.DRAFT,
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
    const request = await this.prisma.purchaseRequest.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber,
        employeeId,
        title: trimmedTitle,
        justification: trimmedJustification,
        vendorName: dto.vendorName?.trim() ?? null,
        vendorEmail: dto.vendorEmail?.trim()
          ? dto.vendorEmail.trim().toLowerCase()
          : null,
        vendorPhone: dto.vendorPhone?.trim() ? dto.vendorPhone.trim() : null,
        requiredByDate: dto.requiredByDate
          ? this.parseRequiredByDate(dto.requiredByDate)
          : null,
        status: PurchaseRequestStatus.DRAFT,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      select: { id: true },
    });
    return request;
  }

  /**
   * Updates header fields of a DRAFT or RETURNED purchase request.
   */
  async updateDraft(
    id: string,
    dto: UpdatePurchaseRequestDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEditableOwner(id, companyId, userId);

    await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.justification !== undefined
          ? { justification: dto.justification.trim() }
          : {}),
        ...(dto.vendorName !== undefined
          ? { vendorName: dto.vendorName?.trim() ?? null }
          : {}),
        ...(dto.vendorEmail !== undefined
          ? {
              vendorEmail: dto.vendorEmail?.trim()
                ? dto.vendorEmail.trim().toLowerCase()
                : null,
            }
          : {}),
        ...(dto.vendorPhone !== undefined
          ? {
              vendorPhone: dto.vendorPhone?.trim()
                ? dto.vendorPhone.trim()
                : null,
            }
          : {}),
        ...(dto.requiredByDate !== undefined
          ? {
              requiredByDate: dto.requiredByDate
                ? this.parseRequiredByDate(dto.requiredByDate)
                : null,
            }
          : {}),
        updatedBy: userId,
      },
    });

    return this.getRequest(id, companyId, userId);
  }

  /**
   * Adds a line item to a DRAFT or RETURNED purchase request owned by the caller.
   */
  async addItem(
    requestId: string,
    dto: AddPurchaseRequestItemDto,
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEditableOwner(requestId, companyId, userId);

    const request = await this.prisma.purchaseRequest.findFirst({
      where: activeOnly({ id: requestId, companyId }),
      select: { id: true, requestNumber: true, attachmentFolderId: true },
    });
    if (!request) {
      throw new NotFoundException('Purchase request not found');
    }

    this.assertPurchaseRequestEtbCurrency(dto.currency);

    const rate = 1;
    const totalPrice = dto.quantity * dto.unitPrice;
    const totalPriceEtb = totalPrice;

    const uploadedDocumentIds = await this.uploadItemImages(
      request,
      companyId,
      userId,
      files,
    );
    const documentId = uploadedDocumentIds[0] ?? null;
    const itemId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseRequestItem.create({
        data: {
          id: itemId,
          requestId,
          itemName: dto.itemName.trim(),
          modelSpec: dto.modelSpec?.trim() || null,
          description: dto.description?.trim() ?? null,
          quantity: new Prisma.Decimal(dto.quantity),
          unit: dto.unit.trim(),
          unitPrice: new Prisma.Decimal(dto.unitPrice),
          currency: 'ETB',
          totalPrice: new Prisma.Decimal(totalPrice),
          totalPriceEtb: new Prisma.Decimal(totalPriceEtb),
          exchangeRate: new Prisma.Decimal(rate),
          documentId,
        },
      });

      if (uploadedDocumentIds.length > 0) {
        await tx.purchaseRequestItemImage.createMany({
          data: uploadedDocumentIds.map((documentId, sortOrder) => ({
            id: randomUUID(),
            itemId,
            documentId,
            sortOrder,
          })),
        });
      }
    });

    await this.recalculateTotals(requestId, userId);
    return this.getRequest(requestId, companyId, userId);
  }

  /**
   * Updates a line item on a DRAFT or RETURNED purchase request.
   */
  async updateItem(
    requestId: string,
    itemId: string,
    dto: UpdatePurchaseRequestItemDto,
    file: UploadedFile | undefined,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEditableOwner(requestId, companyId, userId);

    const request = await this.prisma.purchaseRequest.findFirst({
      where: activeOnly({ id: requestId, companyId }),
      select: { id: true, requestNumber: true, attachmentFolderId: true },
    });
    if (!request) {
      throw new NotFoundException('Purchase request not found');
    }

    const existing = await this.prisma.purchaseRequestItem.findFirst({
      where: { id: itemId, requestId },
    });
    if (!existing) {
      throw new NotFoundException('Purchase request item not found');
    }

    if (dto.currency !== undefined) {
      this.assertPurchaseRequestEtbCurrency(dto.currency);
    }

    const nextQuantity = dto.quantity ?? Number(existing.quantity);
    const nextUnitPrice = dto.unitPrice ?? Number(existing.unitPrice);

    const rate = 1;
    const totalPrice = nextQuantity * nextUnitPrice;
    const totalPriceEtb = totalPrice;

    let documentId = existing.documentId;
    if (file?.buffer?.length) {
      documentId = await this.uploadItemImage(request, companyId, userId, file);
    }

    await this.prisma.purchaseRequestItem.update({
      where: { id: itemId },
      data: {
        itemName: dto.itemName !== undefined ? dto.itemName.trim() : existing.itemName,
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
        unitPrice: new Prisma.Decimal(nextUnitPrice),
        currency: 'ETB',
        totalPrice: new Prisma.Decimal(totalPrice),
        totalPriceEtb: new Prisma.Decimal(totalPriceEtb),
        exchangeRate: new Prisma.Decimal(rate),
        documentId,
      },
    });

    await this.recalculateTotals(requestId, userId);
    return this.getRequest(requestId, companyId, userId);
  }

  /**
   * Removes a line item from a DRAFT or RETURNED purchase request.
   */
  async deleteItem(
    requestId: string,
    itemId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEditableOwner(requestId, companyId, userId);

    const existing = await this.prisma.purchaseRequestItem.findFirst({
      where: { id: itemId, requestId },
    });
    if (!existing) {
      throw new NotFoundException('Purchase request item not found');
    }

    await this.prisma.purchaseRequestItem.delete({ where: { id: itemId } });
    await this.recalculateTotals(requestId, userId);
    return this.getRequest(requestId, companyId, userId);
  }

  /**
   * Submits a DRAFT purchase request for approval.
   * Uploads any attached files to erp-hr storage and opens the approval chain.
   * Returned requests must be resubmitted via the Approvals inbox.
   */
  async submitRequest(
    id: string,
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: { items: true },
    });
    if (!request) {
      throw new NotFoundException('Purchase request not found');
    }
    await this.assertPurchaseRequestSubmitter(companyId, userId);
    if (!(await this.onBehalfService.canActForRecord(userId, companyId, request))) {
      throw new ForbiddenException('Only the request owner can submit it');
    }
    if (request.status !== PurchaseRequestStatus.DRAFT) {
      throw new BadRequestException('Only draft requests can be submitted');
    }
    if (request.items.length === 0) {
      throw new BadRequestException(
        'Add at least one item before submitting',
      );
    }

    const totalEtb = Number(request.totalEstimatedEtb);

    const resolvedTiers =
      await this.hrApprovalChain.buildPurchaseApprovalChain(
        request.employeeId,
        companyId,
      );

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'PURCHASE_REQUEST',
        title: request.title,
        formData: {
          justification: request.justification,
          itemCount: request.items.length,
          totalEstimatedEtb: totalEtb,
          vendorName: request.vendorName,
        },
      },
      companyId,
      request.employeeId,
      {
        resolvedTiers: {
          ruleName: 'Purchase request GM approval',
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
      },
    )) as { id: string; requestNumber: string };

    if (files?.length > 0) {
      await this.uploadRequestFiles(request, files, companyId, userId);
    }

    await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.SUBMITTED,
        approvalRequestId: approval.id,
        submittedAt: new Date(),
        completedAt: null,
        updatedBy: userId,
      },
    });

    return this.getRequest(id, companyId, userId);
  }

  /**
   * Fetches a single purchase request with items and approval tiers.
   */
  async getRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: REQUEST_DETAIL_INCLUDE,
    });
    if (!request) {
      throw new NotFoundException('Purchase request not found');
    }

    await this.assertCanView(request, companyId, userId);

    const pendingTier = request.approvalRequest?.tiers.find(
      (t) =>
        t.tierOrder === request.approvalRequest?.currentTier &&
        t.decision === 'PENDING',
    );

    const { attachmentFolder, ...requestRest } = request;

    return {
      ...requestRest,
      documents: attachmentFolder?.documents ?? [],
      items: request.items.map((item) => this.mapPurchaseRequestItem(item)),
      itemCount: request.items.length,
      currentTierLabel: pendingTier?.label ?? null,
    };
  }

  /**
   * Paginated list. HR viewers see company-wide; others see their own.
   */
  async listRequests(
    filters: ListPurchaseRequestsDto,
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
      'purchase-request',
      'manage',
    );

    const where: Prisma.PurchaseRequestWhereInput = {
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
      ...(filters.amountMin !== undefined || filters.amountMax !== undefined
        ? {
            totalEstimatedEtb: {
              ...(filters.amountMin !== undefined
                ? { gte: new Prisma.Decimal(filters.amountMin) }
                : {}),
              ...(filters.amountMax !== undefined
                ? { lte: new Prisma.Decimal(filters.amountMax) }
                : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.purchaseRequest.findMany({
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
      this.prisma.purchaseRequest.count({ where }),
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
   * Cancels a DRAFT or SUBMITTED purchase request. Only the owner may cancel.
   */
  async cancelRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!request) {
      throw new NotFoundException('Purchase request not found');
    }
    if (request.employeeId !== userId) {
      throw new ForbiddenException('Only the request owner can cancel it');
    }
    if (
      request.status !== PurchaseRequestStatus.DRAFT &&
      request.status !== PurchaseRequestStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted requests can be cancelled',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.purchaseRequest.update({
        where: { id },
        data: {
          status: PurchaseRequestStatus.CANCELLED,
          completedAt: now,
          updatedBy: userId,
        },
      });
      if (request.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: request.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });

    return this.getRequest(id, companyId, userId);
  }

  /**
   * Called by the approval engine when a linked request reaches a terminal decision.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!request) {
      return;
    }
    if (
      request.status === PurchaseRequestStatus.APPROVED ||
      request.status === PurchaseRequestStatus.REJECTED ||
      request.status === PurchaseRequestStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    const nextStatus =
      decision === 'APPROVED'
        ? PurchaseRequestStatus.APPROVED
        : decision === 'REJECTED'
          ? PurchaseRequestStatus.REJECTED
          : PurchaseRequestStatus.RETURNED;

    await this.prisma.purchaseRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        completedAt: decision === 'RETURNED' ? null : now,
        updatedBy: request.employeeId,
      },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Only HR Manager and executive roles may create or submit purchase requests.
   */
  private async assertPurchaseRequestSubmitter(
    companyId: string,
    userId: string,
  ): Promise<void> {
    const primaryRole =
      (await this.hrApprovalChain.getPrimaryRoleName(userId, companyId)) ?? '';
    if (!PURCHASE_REQUEST_SUBMITTER_ROLES.includes(primaryRole)) {
      throw new ForbiddenException(
        'Only HR Manager and above can submit purchase requests',
      );
    }
  }

  private async assertCanManageRequest(
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
      'purchase-request',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException(
        'You do not have permission to modify this purchase request',
      );
    }
  }

  private async assertEditableOwner(
    requestId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: activeOnly({ id: requestId, companyId }),
      select: { id: true, employeeId: true, createdBy: true, status: true },
    });
    if (!request) {
      throw new NotFoundException('Purchase request not found');
    }
    await this.assertCanManageRequest(request, companyId, userId);
    if (
      request.status !== PurchaseRequestStatus.DRAFT &&
      request.status !== PurchaseRequestStatus.RETURNED
    ) {
      throw new BadRequestException(
        'Only draft or returned requests can be edited',
      );
    }
  }

  private async assertCanView(
    request: {
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
      'purchase-request',
      'manage',
    );
    if (canManage) return;

    const isOwner =
      request.employeeId === userId || request.createdBy === userId;
    const isTierApprover =
      // Cancelled requests are hidden from the approval chain.
      request.status !== 'CANCELLED' &&
      (request.approvalRequest?.tiers?.some((t) => t.approverId === userId) ??
      false);

    if (!isOwner && !isTierApprover) {
      throw new ForbiddenException(
        'You do not have access to this purchase request',
      );
    }
  }

  private async recalculateTotals(
    requestId: string,
    userId: string,
  ): Promise<void> {
    const items = await this.prisma.purchaseRequestItem.findMany({
      where: { requestId },
      select: { totalPriceEtb: true },
    });
    const totalEtb = items.reduce(
      (sum, item) => sum + Number(item.totalPriceEtb),
      0,
    );
    await this.prisma.purchaseRequest.update({
      where: { id: requestId },
      data: {
        totalEstimatedEtb: new Prisma.Decimal(totalEtb),
        totalEstimatedCost: new Prisma.Decimal(totalEtb),
        updatedBy: userId,
      },
    });
  }

  private async uploadItemImage(
    request: { id: string; requestNumber: string; attachmentFolderId: string | null },
    companyId: string,
    userId: string,
    file: UploadedFile,
  ): Promise<string> {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Only image files are allowed (JPEG, PNG, WebP, GIF). Received: ${file.mimetype}`,
      );
    }

    const folderId =
      request.attachmentFolderId ??
      (await this.ensureAttachmentFolder(request, companyId, userId));

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `${companyId}/hr/purchase-requests/${request.id}/items/${randomUUID()}_${safeName}`;

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

  private async uploadRequestFiles(
    request: { id: string; requestNumber: string; attachmentFolderId: string | null },
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ): Promise<void> {
    const folderId =
      request.attachmentFolderId ??
      (await this.ensureAttachmentFolder(request, companyId, userId));

    for (const file of files) {
      if (!file?.buffer?.length) {
        continue;
      }
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
      }

      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `${companyId}/hr/purchase-requests/${request.id}/${randomUUID()}_${safeName}`;

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
    request: { id: string; requestNumber: string; attachmentFolderId: string | null },
    companyId: string,
    userId: string,
  ): Promise<string> {
    if (request.attachmentFolderId) {
      return request.attachmentFolderId;
    }

    const folderId = randomUUID();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.documentFolder.create({
        data: {
          id: folderId,
          companyId,
          name: `Purchase Request ${request.requestNumber}`,
          path: `/hr/purchase-requests/${request.requestNumber}`,
          contextType: FolderContextType.PURCHASE_REQUEST,
          contextId: request.id,
          isSystem: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.purchaseRequest.update({
        where: { id: request.id },
        data: { attachmentFolderId: folderId, updatedBy: userId },
      });
    });

    return folderId;
  }

  private normalizeStatuses(
    status: string | undefined,
  ): PurchaseRequestStatus[] | undefined {
    if (!status) return undefined;
    if (status.includes(',')) {
      return status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as PurchaseRequestStatus[];
    }
    return [status as PurchaseRequestStatus];
  }

  private mapPurchaseRequestItem(item: {
    image: {
      id: string;
      name: string;
      fileType: string | null;
      fileSizeBytes: number | null;
    } | null;
    images: Array<{
      document: {
        id: string;
        name: string;
        fileType: string | null;
        fileSizeBytes: number | null;
      };
    }>;
  } & Record<string, unknown>): Record<string, unknown> {
    const gallery =
      item.images.length > 0
        ? item.images.map((row) => row.document)
        : item.image
          ? [item.image]
          : [];

    const { images: _galleryRows, ...rest } = item;

    return {
      ...rest,
      image: gallery[0] ?? null,
      images: gallery,
    };
  }

  private async uploadItemImages(
    request: { id: string; requestNumber: string; attachmentFolderId: string | null },
    companyId: string,
    userId: string,
    files: UploadedFile[],
  ): Promise<string[]> {
    const documentIds: string[] = [];
    for (const file of files) {
      if (!file?.buffer?.length) {
        continue;
      }
      documentIds.push(
        await this.uploadItemImage(request, companyId, userId, file),
      );
    }
    return documentIds;
  }

  /** Purchase requests are priced in ETB only. */
  private assertPurchaseRequestEtbCurrency(currency: SupportedCurrency): void {
    if (currency !== SupportedCurrency.ETB) {
      throw new BadRequestException(
        'Purchase request items must use ETB currency',
      );
    }
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
      SELECT nextval('purchase_request_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `PR-${String(seq).padStart(4, '0')}`;
  }
}
