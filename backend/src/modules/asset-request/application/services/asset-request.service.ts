import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ApprovalRequestStatus,
  AssetRequestStatus,
  AssetStatus,
  FolderContextType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
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
  CreateAssetRequestDto,
  FulfillAssetRequestDto,
  ListAssetRequestsDto,
  UpdateAssetRequestDto,
} from '../dtos/asset-request.dtos';

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

const REQUEST_DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  attachmentFolder: {
    include: {
      documents: {
        select: { id: true, name: true, fileType: true, fileSizeBytes: true },
      },
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
  fulfilledByAsset: {
    select: {
      id: true,
      assetTag: true,
      assetName: true,
      category: true,
      assetType: true,
    },
  },
} as const;

@Injectable()
export class AssetRequestService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AssetRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
    private readonly onBehalfService: OnBehalfService,
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  async createDraft(
    dto: CreateAssetRequestDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const employeeId = await this.resolveEmployeeId(dto.employeeId, userId, companyId);

    const requestNumber = await this.nextRequestNumber();
    const now = new Date();

    const request = await this.prisma.assetRequest.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber,
        employeeId,
        assetCategory: dto.assetCategory.trim(),
        assetType: dto.assetType?.trim() ?? null,
        reason: dto.reason.trim(),
        requiredByDate: dto.requiredByDate ? new Date(dto.requiredByDate) : null,
        notes: dto.notes?.trim() ?? null,
        status: AssetRequestStatus.DRAFT,
        createdAt: now,
        createdBy: userId,
        updatedAt: now,
        updatedBy: userId,
      },
      include: REQUEST_DETAIL_INCLUDE,
    });

    return request;
  }

  async getRequest(id: string, companyId: string, userId: string): Promise<unknown> {
    const request = await this.prisma.assetRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: REQUEST_DETAIL_INCLUDE,
    });
    if (!request) {
      throw new NotFoundException('Asset request not found');
    }

    await this.assertCanView(request, companyId, userId);

    const { attachmentFolder, ...rest } = request;
    return {
      ...rest,
      documents: attachmentFolder?.documents ?? [],
    };
  }

  async listRequests(
    filters: ListAssetRequestsDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);

    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'company-asset',
      'manage',
    );

    const where: Prisma.AssetRequestWhereInput = {
      companyId,
      deletedAt: null,
      ...(canManage ? {} : { employeeId: userId }),
      ...(filters.status?.length ? { status: { in: filters.status } } : {}),
      ...(canManage && filters.employeeId ? { employeeId: filters.employeeId } : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              { requestNumber: { contains: filters.search.trim(), mode: 'insensitive' as const } },
              { assetCategory: { contains: filters.search.trim(), mode: 'insensitive' as const } },
              { assetType: { contains: filters.search.trim(), mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo + 'T23:59:59.999Z') } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.assetRequest.count({ where }),
      this.prisma.assetRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: USER_SELECT },
          approvalRequest: { select: { id: true, status: true, currentTier: true } },
        },
      }),
    ]);

    return buildPaginatedResult(rows, total, page, limit);
  }

  async updateDraft(
    id: string,
    dto: UpdateAssetRequestDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.assetRequest.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!request) {
      throw new NotFoundException('Asset request not found');
    }
    if (!(await this.onBehalfService.canActForRecord(userId, companyId, request))) {
      throw new ForbiddenException('Not authorised to edit this request');
    }
    if (request.status !== AssetRequestStatus.DRAFT && request.status !== AssetRequestStatus.RETURNED) {
      throw new BadRequestException('Only draft or returned requests can be edited');
    }

    const updated = await this.prisma.assetRequest.update({
      where: { id },
      data: {
        ...(dto.assetCategory !== undefined ? { assetCategory: dto.assetCategory.trim() } : {}),
        ...(dto.assetType !== undefined ? { assetType: dto.assetType?.trim() ?? null } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason.trim() } : {}),
        ...(dto.requiredByDate !== undefined
          ? { requiredByDate: dto.requiredByDate ? new Date(dto.requiredByDate) : null }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
        updatedBy: userId,
      },
      include: REQUEST_DETAIL_INCLUDE,
    });

    const { attachmentFolder, ...rest } = updated;
    return { ...rest, documents: attachmentFolder?.documents ?? [] };
  }

  async submitRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.assetRequest.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!request) {
      throw new NotFoundException('Asset request not found');
    }
    if (!(await this.onBehalfService.canActForRecord(userId, companyId, request))) {
      throw new ForbiddenException('Only the request owner can submit it');
    }
    if (request.status !== AssetRequestStatus.DRAFT) {
      throw new BadRequestException('Only draft requests can be submitted');
    }

    const resolvedTiers = await this.hrApprovalChain.buildMaterialRequisitionApprovalChain(
      request.employeeId,
      companyId,
    );

    if (resolvedTiers.length === 0) {
      const now = new Date();
      await this.prisma.assetRequest.update({
        where: { id },
        data: {
          status: AssetRequestStatus.APPROVED,
          submittedAt: now,
          completedAt: now,
          updatedBy: userId,
        },
      });
      this.logger.log(
        `Asset request ${request.requestNumber} auto-approved (HR+ submitter)`,
      );
      return this.getRequest(id, companyId, userId);
    }

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'ASSET_REQUEST',
        title: `Asset Request: ${request.assetCategory}`,
        formData: {
          assetCategory: request.assetCategory,
          assetType: request.assetType,
          reason: request.reason,
          requiredByDate: request.requiredByDate,
        },
      },
      companyId,
      request.employeeId,
      {
        resolvedTiers: {
          ruleName: 'Asset request chain',
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
      },
    )) as { id: string; requestNumber: string };

    await this.prisma.assetRequest.update({
      where: { id },
      data: {
        status: AssetRequestStatus.SUBMITTED,
        approvalRequestId: approval.id,
        submittedAt: new Date(),
        completedAt: null,
        updatedBy: userId,
      },
    });

    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'ASSET_REQUEST',
      companyId,
      actorUserId: userId,
      employeeId: request.employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: await this.onBehalfService.wasAutoApproveRequested(
        'ASSET_REQUEST',
        id,
        userId,
        companyId,
      ),
    });

    return this.getRequest(id, companyId, userId);
  }

  async cancelRequest(id: string, companyId: string, userId: string): Promise<unknown> {
    const request = await this.prisma.assetRequest.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!request) {
      throw new NotFoundException('Asset request not found');
    }
    if (!(await this.onBehalfService.canActForRecord(userId, companyId, request))) {
      throw new ForbiddenException('Not authorised to cancel this request');
    }
    if (
      request.status !== AssetRequestStatus.DRAFT &&
      request.status !== AssetRequestStatus.SUBMITTED
    ) {
      throw new BadRequestException('Only draft or submitted requests can be cancelled');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.assetRequest.update({
        where: { id },
        data: { status: AssetRequestStatus.CANCELLED, completedAt: now, updatedBy: userId },
      });
      if (request.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: request.approvalRequestId },
          data: { status: ApprovalRequestStatus.CANCELLED, completedAt: now, updatedBy: userId },
        });
      }
    });

    return this.getRequest(id, companyId, userId);
  }

  async fulfillRequest(
    id: string,
    dto: FulfillAssetRequestDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.assetRequest.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!request) {
      throw new NotFoundException('Asset request not found');
    }
    if (request.status !== AssetRequestStatus.APPROVED) {
      throw new BadRequestException('Only approved requests can be fulfilled');
    }

    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'company-asset',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException('Only HR can fulfil asset requests');
    }

    if (dto.assetId) {
      const asset = await this.prisma.companyAsset.findFirst({
        where: activeOnly({ id: dto.assetId, companyId }),
      });
      if (!asset) {
        throw new NotFoundException('Asset not found');
      }
      if (asset.status !== AssetStatus.AVAILABLE) {
        throw new BadRequestException('Asset is not available for fulfilment');
      }
    }

    const now = new Date();
    await this.prisma.assetRequest.update({
      where: { id },
      data: {
        status: AssetRequestStatus.FULFILLED,
        fulfilledByAssetId: dto.assetId ?? null,
        completedAt: now,
        updatedBy: userId,
      },
    });

    return this.getRequest(id, companyId, userId);
  }

  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const request = await this.prisma.assetRequest.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!request) return;
    if (
      request.status === AssetRequestStatus.APPROVED ||
      request.status === AssetRequestStatus.REJECTED ||
      request.status === AssetRequestStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    const nextStatus =
      decision === 'APPROVED'
        ? AssetRequestStatus.APPROVED
        : decision === 'REJECTED'
          ? AssetRequestStatus.REJECTED
          : AssetRequestStatus.RETURNED;

    await this.prisma.assetRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        completedAt: decision === 'RETURNED' ? null : now,
        updatedBy: request.employeeId,
      },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async resolveEmployeeId(
    dtoEmployeeId: string | undefined,
    actorUserId: string,
    companyId: string,
  ): Promise<string> {
    if (!dtoEmployeeId) return actorUserId;

    const canManage = await this.permissionService.hasPermission(
      actorUserId,
      companyId,
      'company-asset',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException('Only HR can submit on behalf of another employee');
    }
    return dtoEmployeeId;
  }

  private async assertCanView(
    record: { employeeId: string; createdBy: string },
    companyId: string,
    userId: string,
  ): Promise<void> {
    if (record.employeeId === userId || record.createdBy === userId) return;
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'company-asset',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException('Not authorised to view this request');
    }
  }

  private async nextRequestNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('asset_request_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `AR-${String(seq).padStart(4, '0')}`;
  }
}
