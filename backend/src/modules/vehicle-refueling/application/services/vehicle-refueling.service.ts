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
  VehicleRefuelingStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
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
  ListVehicleRefuelingsDto,
  SubmitVehicleRefuelingDto,
} from '../dtos/vehicle-refueling.dtos';

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

const REFUELING_DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  driver: { select: USER_SELECT },
  vehicle: true,
  receiptDocument: {
    select: {
      id: true,
      name: true,
      fileKey: true,
      fileType: true,
      fileSizeBytes: true,
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

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

/**
 * Vehicle refueling request lifecycle - submit-in-one-call with HR Officer
 * approval tier (or direct APPROVED for HR and above).
 * Receipt attachment after approval via multipart upload.
 */
@Injectable()
export class VehicleRefuelingService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(VehicleRefuelingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly onBehalfService: OnBehalfService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
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
   * Creates and submits a refueling request in a single call.
   * Validates vehicle exists, builds approval chain.
   */
  async submitRequest(
    dto: SubmitVehicleRefuelingDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    const vehicle = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ id: dto.vehicleId, companyId }),
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const requestNumber = await this.nextRequestNumber();

    const resolvedTiers =
      await this.hrApprovalChain.buildVehicleRefuelingApprovalChain(
        employeeId,
        companyId,
      );

    const now = new Date();
    const id = randomUUID();
    const fuelDate = this.parseDateOnly(dto.fuelDate);

    if (resolvedTiers.length === 0) {
      await this.prisma.vehicleRefueling.create({
        data: {
          id,
          companyId,
          requestNumber,
          employeeId,
          vehicleId: dto.vehicleId,
          driverId: dto.driverId || null,
          fuelDate,
          fuelType: dto.fuelType,
          fuelStation: dto.fuelStation.trim(),
          currentMileage: new Prisma.Decimal(dto.currentMileage),
          requestedLitres: new Prisma.Decimal(dto.requestedLitres),
          unitPriceEtb:
            dto.unitPriceEtb != null
              ? new Prisma.Decimal(dto.unitPriceEtb)
              : null,
          totalCostEtb: this.computeTotalCostEtb(
            dto.requestedLitres,
            dto.unitPriceEtb,
          ),
          notes: dto.notes?.trim() || null,
          status: VehicleRefuelingStatus.APPROVED,
          submittedAt: now,
          completedAt: now,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      this.logger.log(
        `Vehicle refueling ${requestNumber} auto-approved (HR+ submitter)`,
      );
      await this.onBehalfService.recordOnBehalfCreate({
        moduleCode: 'VEHICLE_REFUELING',
        companyId,
        actorUserId: userId,
        employeeId,
        recordId: id,
        recordReference: requestNumber,
        autoApproveTier: dto.autoApproveTier,
      });
      return this.getRefueling(id, companyId, userId);
    }

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'VEHICLE_REFUELING',
        title: `Vehicle Refueling - ${vehicle.plateNumber}`,
        formData: {
          vehiclePlate: vehicle.plateNumber,
          fuelType: dto.fuelType,
          fuelStation: dto.fuelStation,
          requestedLitres: dto.requestedLitres,
          currentMileage: dto.currentMileage,
          date: dto.fuelDate,
        },
      },
      companyId,
      employeeId,
      {
        resolvedTiers: {
          ruleName: 'Vehicle Refueling HR Officer chain',
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
      },
    )) as { id: string; requestNumber: string };

    await this.prisma.vehicleRefueling.create({
      data: {
        id,
        companyId,
        requestNumber,
        employeeId,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId || null,
        fuelDate,
        fuelType: dto.fuelType,
        fuelStation: dto.fuelStation.trim(),
        currentMileage: new Prisma.Decimal(dto.currentMileage),
        requestedLitres: new Prisma.Decimal(dto.requestedLitres),
        unitPriceEtb:
          dto.unitPriceEtb != null
            ? new Prisma.Decimal(dto.unitPriceEtb)
            : null,
        totalCostEtb: this.computeTotalCostEtb(
          dto.requestedLitres,
          dto.unitPriceEtb,
        ),
        notes: dto.notes?.trim() || null,
        status: VehicleRefuelingStatus.SUBMITTED,
        approvalRequestId: approval.id,
        submittedAt: now,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'VEHICLE_REFUELING',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId: id,
      recordReference: requestNumber,
      autoApproveTier: dto.autoApproveTier,
    });
    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'VEHICLE_REFUELING',
      companyId,
      actorUserId: userId,
      employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: dto.autoApproveTier === true,
    });

    return this.getRefueling(id, companyId, userId);
  }

  /**
   * Creates a DRAFT refueling request for an employee without touching the
   * approval workflow. Used by the Excel importer.
   */
  async createDraftFromImport(
    employeeId: string,
    dto: SubmitVehicleRefuelingDto,
    companyId: string,
    actorUserId: string,
  ): Promise<{ id: string; requestNumber: string }> {
    if (employeeId !== actorUserId) {
      const canFileOnBehalf = await this.hrApprovalChain.isHrOrFullAccessActor(
        actorUserId,
        companyId,
      );
      if (!canFileOnBehalf) {
        throw new ForbiddenException(
          'Only HR or a full-access role can import refueling requests for another employee',
        );
      }
    }

    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const vehicle = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ id: dto.vehicleId, companyId }),
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return this.prisma.vehicleRefueling.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber: await this.nextRequestNumber(),
        employeeId,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId || null,
        fuelDate: this.parseDateOnly(dto.fuelDate),
        fuelType: dto.fuelType,
        fuelStation: dto.fuelStation.trim(),
        currentMileage: new Prisma.Decimal(dto.currentMileage),
        requestedLitres: new Prisma.Decimal(dto.requestedLitres),
        unitPriceEtb:
          dto.unitPriceEtb != null ? new Prisma.Decimal(dto.unitPriceEtb) : null,
        totalCostEtb: this.computeTotalCostEtb(
          dto.requestedLitres,
          dto.unitPriceEtb,
        ),
        notes: dto.notes?.trim() || null,
        status: VehicleRefuelingStatus.DRAFT,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      select: { id: true, requestNumber: true },
    });
  }

  /** Fetches a single refueling request with vehicle and approval tiers. */
  async getRefueling(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const refueling = await this.prisma.vehicleRefueling.findFirst({
      where: activeOnly({ id, companyId }),
      include: REFUELING_DETAIL_INCLUDE,
    });
    if (!refueling) {
      throw new NotFoundException('Vehicle refueling request not found');
    }

    await this.assertCanView(refueling, companyId, userId);

    const pendingTier = refueling.approvalRequest?.tiers.find(
      (t) =>
        t.tierOrder === refueling.approvalRequest?.currentTier &&
        t.decision === 'PENDING',
    );

    return {
      ...refueling,
      currentTierLabel: pendingTier?.label ?? null,
      directApproved:
        refueling.status === VehicleRefuelingStatus.APPROVED &&
        !refueling.approvalRequestId,
    };
  }

  /** Paginated list. HR viewers see company-wide; others see their own. */
  async listRefuelings(
    filters: ListVehicleRefuelingsDto,
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
      'vehicle-refueling',
      'manage',
    );

    const where: Prisma.VehicleRefuelingWhereInput = {
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
                fuelStation: {
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
                ? { gte: new Date(filters.dateFrom) }
                : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.vehicleRefueling.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: USER_SELECT },
          driver: { select: USER_SELECT },
          vehicle: {
            select: {
              id: true,
              plateNumber: true,
              make: true,
              model: true,
            },
          },
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
      this.prisma.vehicleRefueling.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => {
        const { approvalRequest, ...rest } = row;
        const pendingTier = approvalRequest?.tiers[0];
        return {
          ...rest,
          approvalRequest,
          currentTierLabel: pendingTier?.label ?? null,
          directApproved:
            rest.status === VehicleRefuelingStatus.APPROVED &&
            !rest.approvalRequestId,
        };
      }),
      total,
      page,
      limit,
    );
  }

  /** Cancels a DRAFT or SUBMITTED refueling request. Owner only. */
  async cancelRefueling(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const refueling = await this.prisma.vehicleRefueling.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!refueling) {
      throw new NotFoundException('Vehicle refueling request not found');
    }
    if (refueling.employeeId !== userId) {
      throw new ForbiddenException('Only the request owner can cancel it');
    }
    if (
      refueling.status !== VehicleRefuelingStatus.DRAFT &&
      refueling.status !== VehicleRefuelingStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted requests can be cancelled',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.vehicleRefueling.update({
        where: { id },
        data: {
          status: VehicleRefuelingStatus.CANCELLED,
          completedAt: now,
          updatedBy: userId,
        },
      });
      if (refueling.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: refueling.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });

    return this.getRefueling(id, companyId, userId);
  }

  /**
   * Attaches a receipt document to an APPROVED refueling request.
   * Uploads to STORAGE_BUCKETS.HR, creates Document + DocumentVersion,
   * sets receiptDocumentId on the refueling record.
   */
  async attachReceipt(
    id: string,
    companyId: string,
    userId: string,
    file: UploadedFile,
  ): Promise<unknown> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Receipt file is required');
    }
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `File type not allowed: ${file.mimetype}`,
      );
    }

    const refueling = await this.prisma.vehicleRefueling.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!refueling) {
      throw new NotFoundException('Vehicle refueling request not found');
    }
    if (refueling.status !== VehicleRefuelingStatus.APPROVED) {
      throw new BadRequestException(
        'Receipts can only be attached to approved requests',
      );
    }

    const folderId = await this.ensureRefuelingFolder(refueling, userId);

    const documentId = randomUUID();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `${companyId}/vehicle-refueling/${refueling.requestNumber}/${safeName}`;

    await this.storage.upload({
      bucket: STORAGE_BUCKETS.HR,
      key: fileKey,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
    });

    await this.prisma.$transaction(async (tx) => {
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
      await tx.vehicleRefueling.update({
        where: { id },
        data: {
          receiptDocumentId: documentId,
          updatedBy: userId,
        },
      });
    });

    return this.getRefueling(id, companyId, userId);
  }

  /**
   * Called by the approval engine when a linked request reaches a terminal decision.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const refueling = await this.prisma.vehicleRefueling.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!refueling) {
      return;
    }
    if (
      refueling.status === VehicleRefuelingStatus.APPROVED ||
      refueling.status === VehicleRefuelingStatus.REJECTED ||
      refueling.status === VehicleRefuelingStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    const nextStatus =
      decision === 'APPROVED'
        ? VehicleRefuelingStatus.APPROVED
        : decision === 'REJECTED'
          ? VehicleRefuelingStatus.REJECTED
          : VehicleRefuelingStatus.RETURNED;

    await this.prisma.vehicleRefueling.update({
      where: { id: refueling.id },
      data: {
        status: nextStatus,
        completedAt: decision === 'RETURNED' ? null : now,
        updatedBy: refueling.employeeId,
      },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async ensureRefuelingFolder(
    refueling: {
      id: string;
      companyId: string;
      requestNumber: string;
      attachmentFolderId: string | null;
    },
    userId: string,
  ): Promise<string> {
    if (refueling.attachmentFolderId) {
      return refueling.attachmentFolderId;
    }

    const folderId = randomUUID();
    const path = `/vehicle-refueling/${refueling.requestNumber}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.documentFolder.create({
        data: {
          id: folderId,
          companyId: refueling.companyId,
          name: `Refueling ${refueling.requestNumber}`,
          path,
          contextType: FolderContextType.VEHICLE_REFUELING,
          contextId: refueling.id,
          isSystem: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.vehicleRefueling.update({
        where: { id: refueling.id },
        data: {
          attachmentFolderId: folderId,
          updatedBy: userId,
        },
      });
    });

    return folderId;
  }

  private async assertCanView(
    refueling: {
      status: string;
      employeeId: string;
      createdBy?: string;
      approvalRequest?: { tiers?: Array<{ approverId: string }> } | null;
    },
    companyId: string,
    userId: string,
  ): Promise<void> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'vehicle-refueling',
      'manage',
    );
    if (canManage) return;

    const isOwner = refueling.employeeId === userId || refueling.createdBy === userId;
    const isTierApprover =
      // Cancelled requests are hidden from the approval chain.
      refueling.status !== 'CANCELLED' &&
      (refueling.approvalRequest?.tiers?.some(
        (t) => t.approverId === userId,
      ) ?? false);

    if (!isOwner && !isTierApprover) {
      throw new ForbiddenException(
        'You do not have access to this refueling request',
      );
    }
  }

  private normalizeStatuses(
    status: string | undefined,
  ): VehicleRefuelingStatus[] | undefined {
    if (!status) return undefined;
    if (status.includes(',')) {
      return status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as VehicleRefuelingStatus[];
    }
    return [status as VehicleRefuelingStatus];
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

  private computeTotalCostEtb(
    requestedLitres: number,
    unitPriceEtb?: number | null,
  ): Prisma.Decimal | null {
    if (unitPriceEtb === undefined || unitPriceEtb === null) {
      return null;
    }
    return new Prisma.Decimal(requestedLitres * unitPriceEtb);
  }

  private async nextRequestNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('vehicle_refueling_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `OVR-${String(seq).padStart(4, '0')}`;
  }
}
