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
  DriveType,
  Prisma,
  VehicleApplicationStatus,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  canViewThroughTeam,
  resolveTeamScopedEmployeeIds,
  teamScopeWhere,
} from '../../../../shared/org/team-scope.util';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { isInstantOnPastDay } from '../../../../shared/utils/date-validation.util';
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
  ListVehicleApplicationsDto,
  SubmitVehicleApplicationDto,
  UpdateVehicleApplicationDto,
} from '../dtos/vehicle-application.dtos';

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

const APPLICATION_DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  driver: { select: USER_SELECT },
  vehicle: {
    include: {
      assignedDriver: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  project: { select: { id: true, projectCode: true, name: true } },
  releasedByUser: { select: USER_SELECT },
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
 * Vehicle application lifecycle - submit-in-one-call with HR Officer
 * approval tier (or direct APPROVED for HR and above).
 */
@Injectable()
export class VehicleApplicationService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(VehicleApplicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly onBehalfService: OnBehalfService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  /**
   * Creates and submits a vehicle application in a single call.
   * Validates return > departure, checks vehicle availability,
   * builds approval chain.
   */
  async submitApplication(
    dto: SubmitVehicleApplicationDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    const { departure, returnDt, vehicle, driverId } =
      await this.resolveApplicationInput(dto, companyId, userId);

    const applicationNumber = await this.nextApplicationNumber();

    const resolvedTiers =
      await this.hrApprovalChain.buildVehicleApplicationApprovalChain(
        employeeId,
        companyId,
      );

    const now = new Date();
    const id = randomUUID();

    if (resolvedTiers.length === 0) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.vehicleApplication.create({
          data: {
            id,
            companyId,
            applicationNumber,
            employeeId,
            vehicleId: dto.vehicleId,
            driveType: dto.driveType,
            driverId,
            departureDatetime: departure,
            returnDatetime: returnDt,
            destination: dto.destination.trim(),
            purpose: dto.purpose.trim(),
            passengerCount: dto.passengerCount ?? 1,
            passengerNames: dto.passengerNames?.trim() || null,
            projectId: dto.projectId || null,
            notes: dto.notes?.trim() || null,
            status: VehicleApplicationStatus.APPROVED,
            submittedAt: now,
            completedAt: now,
            createdBy: userId,
            updatedBy: userId,
          },
        });
        await tx.companyVehicle.update({
          where: { id: dto.vehicleId },
          data: {
            status: VehicleStatus.APPROVED,
            updatedBy: userId,
          },
        });
      });
      this.logger.log(
        `Vehicle application ${applicationNumber} auto-approved (HR+ submitter)`,
      );
      await this.onBehalfService.recordOnBehalfCreate({
        moduleCode: 'VEHICLE_APPLICATION',
        companyId,
        actorUserId: userId,
        employeeId,
        recordId: id,
        recordReference: applicationNumber,
        autoApproveTier: dto.autoApproveTier,
      });
      return this.getApplication(id, companyId, userId);
    }

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'VEHICLE_APPLICATION',
        ...this.approvalSnapshot(dto, vehicle.plateNumber),
      },
      companyId,
      employeeId,
      {
        resolvedTiers: {
          ruleName: 'Vehicle Application HR Officer chain',
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
      },
    )) as { id: string; requestNumber: string };

    await this.prisma.vehicleApplication.create({
      data: {
        id,
        companyId,
        applicationNumber,
        employeeId,
        vehicleId: dto.vehicleId,
        driveType: dto.driveType,
        driverId,
        departureDatetime: departure,
        returnDatetime: returnDt,
        destination: dto.destination.trim(),
        purpose: dto.purpose.trim(),
        passengerCount: dto.passengerCount ?? 1,
        passengerNames: dto.passengerNames?.trim() || null,
        projectId: dto.projectId || null,
        notes: dto.notes?.trim() || null,
        status: VehicleApplicationStatus.SUBMITTED,
        approvalRequestId: approval.id,
        submittedAt: now,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'VEHICLE_APPLICATION',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId: id,
      recordReference: applicationNumber,
      autoApproveTier: dto.autoApproveTier,
    });
    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'VEHICLE_APPLICATION',
      companyId,
      actorUserId: userId,
      employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: dto.autoApproveTier === true,
    });

    return this.getApplication(id, companyId, userId);
  }

  /**
   * Employee edits their own DRAFT or RETURNED vehicle application. Same
   * validation (dates, driver, availability) as submit.
   * Saves only: status is unchanged; a
   * RETURNED request is resubmitted separately from Approvals.
   */
  async updateApplication(
    id: string,
    dto: UpdateVehicleApplicationDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const application = await this.prisma.vehicleApplication.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!application) {
      throw new NotFoundException('Vehicle application not found');
    }
    if (application.employeeId !== userId) {
      throw new ForbiddenException('You can only edit your own requests.');
    }
    if (
      application.status !== VehicleApplicationStatus.DRAFT &&
      application.status !== VehicleApplicationStatus.RETURNED
    ) {
      throw new ForbiddenException('This request can no longer be edited.');
    }

    const { departure, returnDt, vehicle, driverId } =
      await this.resolveApplicationInput(dto, companyId, userId);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.vehicleApplication.update({
        where: { id },
        data: {
          vehicleId: dto.vehicleId,
          driveType: dto.driveType,
          driverId,
          departureDatetime: departure,
          returnDatetime: returnDt,
          destination: dto.destination.trim(),
          purpose: dto.purpose.trim(),
          passengerCount: dto.passengerCount ?? 1,
          passengerNames: dto.passengerNames?.trim() || null,
          projectId: dto.projectId || null,
          notes: dto.notes?.trim() || null,
          updatedBy: userId,
        },
      });
      if (application.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: application.approvalRequestId },
          data: {
            ...this.approvalSnapshot(dto, vehicle.plateNumber),
            updatedBy: userId,
          },
        });
      }
    });

    return this.getApplication(id, companyId, userId);
  }

  /**
   * Validates dates, vehicle, driver and availability. Shared by submit and
   * edit (the edited row is DRAFT/RETURNED, so it never blocks itself).
   */
  private async resolveApplicationInput(
    dto: UpdateVehicleApplicationDto,
    companyId: string,
    userId: string,
  ) {
    const departure = new Date(dto.departureDatetime);
    const returnDt = new Date(dto.returnDatetime);

    if (returnDt <= departure) {
      throw new BadRequestException(
        'Return date/time must be after departure date/time',
      );
    }
    await this.assertDepartureNotBackdated(departure, companyId, userId);

    const vehicle = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ id: dto.vehicleId, companyId }),
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const driverId =
      dto.driveType === DriveType.COMPANY_DRIVER
        ? dto.driverId || vehicle.assignedDriverId || null
        : null;

    if (dto.driveType === DriveType.COMPANY_DRIVER && !driverId) {
      throw new BadRequestException(
        'driverId is required when driveType is COMPANY_DRIVER',
      );
    }

    await this.assertVehicleAvailable(
      dto.vehicleId,
      companyId,
      departure,
      returnDt,
    );

    return { departure, returnDt, vehicle, driverId };
  }

  /** Approval title + formData mirrored from the vehicle application. */
  private approvalSnapshot(
    dto: UpdateVehicleApplicationDto,
    vehiclePlate: string,
  ) {
    return {
      title: `Vehicle Application - ${vehiclePlate}`,
      formData: {
        vehiclePlate,
        driveType: dto.driveType,
        destination: dto.destination,
        departureDatetime: dto.departureDatetime,
        returnDatetime: dto.returnDatetime,
        purpose: dto.purpose,
        passengerCount: dto.passengerCount,
      },
    };
  }

  /**
   * Creates a DRAFT vehicle application for an employee without touching the
   * approval workflow. Used by the Excel importer; drafts are submitted later
   * from the UI like any other draft.
   */
  async createDraftFromImport(
    employeeId: string,
    dto: SubmitVehicleApplicationDto,
    companyId: string,
    actorUserId: string,
  ): Promise<{ id: string; applicationNumber: string }> {
    const departure = new Date(dto.departureDatetime);
    const returnDt = new Date(dto.returnDatetime);
    if (returnDt <= departure) {
      throw new BadRequestException(
        'Return date/time must be after departure date/time',
      );
    }

    if (employeeId !== actorUserId) {
      const canFileOnBehalf = await this.hrApprovalChain.isHrOrFullAccessActor(
        actorUserId,
        companyId,
      );
      if (!canFileOnBehalf) {
        throw new ForbiddenException(
          'Only HR or a full-access role can import vehicle applications for another employee',
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
      select: { id: true, assignedDriverId: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const driverId =
      dto.driveType === DriveType.COMPANY_DRIVER
        ? dto.driverId || vehicle.assignedDriverId || null
        : null;
    if (dto.driveType === DriveType.COMPANY_DRIVER && !driverId) {
      throw new BadRequestException(
        'A driver is required when the drive type is Company Driver',
      );
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: activeOnly({ id: dto.projectId, companyId }),
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
    }

    const applicationNumber = await this.nextApplicationNumber();
    const created = await this.prisma.vehicleApplication.create({
      data: {
        id: randomUUID(),
        companyId,
        applicationNumber,
        employeeId,
        vehicleId: dto.vehicleId,
        driveType: dto.driveType,
        driverId,
        departureDatetime: departure,
        returnDatetime: returnDt,
        destination: dto.destination.trim(),
        purpose: dto.purpose.trim(),
        passengerCount: dto.passengerCount ?? 1,
        passengerNames: dto.passengerNames?.trim() || null,
        projectId: dto.projectId || null,
        notes: dto.notes?.trim() || null,
        status: VehicleApplicationStatus.DRAFT,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      select: { id: true, applicationNumber: true },
    });

    return created;
  }

  /**
   * Past departure days may only be recorded by HR / full-access users.
   * Compared in the company timezone.
   */
  private async assertDepartureNotBackdated(
    departure: Date,
    companyId: string,
    userId: string,
  ): Promise<void> {
    if (!isInstantOnPastDay(departure)) {
      return;
    }
    const canBackdate =
      (await this.permissionService.hasPermission(
        userId,
        companyId,
        'vehicle-application',
        'manage',
      )) ||
      (await this.hrApprovalChain.isHrOrFullAccessActor(userId, companyId));
    if (!canBackdate) {
      throw new BadRequestException(
        'Past departure dates can only be set by HR officers',
      );
    }
  }

  /** Fetches a single vehicle application with vehicle and approval tiers. */
  async getApplication(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const application = await this.prisma.vehicleApplication.findFirst({
      where: activeOnly({ id, companyId }),
      include: APPLICATION_DETAIL_INCLUDE,
    });
    if (!application) {
      throw new NotFoundException('Vehicle application not found');
    }

    await this.assertCanView(application, companyId, userId);

    const pendingTier = application.approvalRequest?.tiers.find(
      (t) =>
        t.tierOrder === application.approvalRequest?.currentTier &&
        t.decision === 'PENDING',
    );

    return {
      ...application,
      currentTierLabel: pendingTier?.label ?? null,
      directApproved:
        application.status === VehicleApplicationStatus.APPROVED &&
        !application.approvalRequestId,
    };
  }

  /** Paginated list. HR viewers see company-wide; others see their own. */
  async listApplications(
    filters: ListVehicleApplicationsDto,
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
      'vehicle-application',
      'manage',
    );

    // Own applications plus the team's for supervisors (not their drafts or
    // cancelled ones).
    const teamScope = canManage
      ? null
      : teamScopeWhere(
          userId,
          await resolveTeamScopedEmployeeIds(this.prisma, userId, companyId),
          filters.employeeId,
        );

    const where: Prisma.VehicleApplicationWhereInput = {
      companyId,
      deletedAt: null,
      ...(teamScope ? { AND: [teamScope] } : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(canManage && filters.employeeId
        ? { employeeId: filters.employeeId }
        : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              {
                applicationNumber: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                purpose: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                destination: {
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
      this.prisma.vehicleApplication.findMany({
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
          project: { select: { id: true, projectCode: true, name: true } },
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
      this.prisma.vehicleApplication.count({ where }),
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
            rest.status === VehicleApplicationStatus.APPROVED &&
            !rest.approvalRequestId,
        };
      }),
      total,
      page,
      limit,
    );
  }

  /** Cancels a DRAFT or SUBMITTED vehicle application. Owner only. */
  async cancelApplication(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const application = await this.prisma.vehicleApplication.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!application) {
      throw new NotFoundException('Vehicle application not found');
    }
    if (application.employeeId !== userId) {
      throw new ForbiddenException('Only the request owner can cancel it');
    }
    if (
      application.status !== VehicleApplicationStatus.DRAFT &&
      application.status !== VehicleApplicationStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted applications can be cancelled',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.vehicleApplication.update({
        where: { id },
        data: {
          status: VehicleApplicationStatus.CANCELLED,
          completedAt: now,
          updatedBy: userId,
        },
      });
      if (application.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: application.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });

    return this.getApplication(id, companyId, userId);
  }

  /**
   * Releases a vehicle after use - only APPROVED applications.
   * Sets releasedAt/releasedBy and puts vehicle back to AVAILABLE.
   */
  async releaseVehicle(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const application = await this.prisma.vehicleApplication.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!application) {
      throw new NotFoundException('Vehicle application not found');
    }
    if (application.status !== VehicleApplicationStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved applications can be released',
      );
    }
    if (application.releasedAt) {
      throw new BadRequestException(
        'Vehicle has already been released for this application',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.vehicleApplication.update({
        where: { id },
        data: {
          releasedAt: now,
          releasedBy: userId,
          updatedBy: userId,
        },
      });
      await tx.companyVehicle.update({
        where: { id: application.vehicleId },
        data: {
          status: VehicleStatus.AVAILABLE,
          updatedBy: userId,
        },
      });
    });

    return this.getApplication(id, companyId, userId);
  }

  /**
   * Called by the approval engine when a linked request reaches a terminal decision.
   * Sets vehicle status to APPROVED on approve, AVAILABLE on reject/return.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const application = await this.prisma.vehicleApplication.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!application) {
      return;
    }
    if (
      application.status === VehicleApplicationStatus.APPROVED ||
      application.status === VehicleApplicationStatus.REJECTED ||
      application.status === VehicleApplicationStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    const nextStatus =
      decision === 'APPROVED'
        ? VehicleApplicationStatus.APPROVED
        : decision === 'REJECTED'
          ? VehicleApplicationStatus.REJECTED
          : VehicleApplicationStatus.RETURNED;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.vehicleApplication.update({
        where: { id: application.id },
        data: {
          status: nextStatus,
          completedAt: decision === 'RETURNED' ? null : now,
          updatedBy: application.employeeId,
        },
      });

      if (decision === 'APPROVED') {
        await tx.companyVehicle.update({
          where: { id: application.vehicleId },
          data: {
            status: VehicleStatus.APPROVED,
            updatedBy: application.employeeId,
          },
        });
      }

      if (decision === 'REJECTED' || decision === 'RETURNED') {
        await tx.companyVehicle.update({
          where: { id: application.vehicleId },
          data: {
            status: VehicleStatus.AVAILABLE,
            updatedBy: application.employeeId,
          },
        });
      }
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertVehicleAvailable(
    vehicleId: string,
    companyId: string,
    departure: Date,
    returnDt: Date,
  ): Promise<void> {
    const conflictingStatuses = [
      VehicleApplicationStatus.SUBMITTED,
      VehicleApplicationStatus.IN_REVIEW,
      VehicleApplicationStatus.APPROVED,
    ];

    const conflict = await this.prisma.vehicleApplication.findFirst({
      where: activeOnly({
        companyId,
        vehicleId,
        status: { in: conflictingStatuses },
        departureDatetime: { lt: returnDt },
        returnDatetime: { gt: departure },
      }),
      select: {
        applicationNumber: true,
        departureDatetime: true,
        returnDatetime: true,
      },
    });

    if (conflict) {
      throw new BadRequestException(
        `Vehicle is not available - conflicts with application ${conflict.applicationNumber} ` +
          `(${conflict.departureDatetime.toISOString()} – ${conflict.returnDatetime.toISOString()})`,
      );
    }
  }

  private async assertCanView(
    application: {
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
      'vehicle-application',
      'manage',
    );
    if (canManage) return;

    const isOwner = application.employeeId === userId || application.createdBy === userId;
    const isTierApprover =
      // Cancelled requests are hidden from the approval chain.
      application.status !== 'CANCELLED' &&
      (application.approvalRequest?.tiers?.some(
        (t) => t.approverId === userId,
      ) ?? false);

    if (
      !isOwner &&
      !isTierApprover &&
      !(await canViewThroughTeam(this.prisma, userId, companyId, application))
    ) {
      throw new ForbiddenException(
        'You do not have access to this vehicle application',
      );
    }
  }

  private normalizeStatuses(
    status: string | undefined,
  ): VehicleApplicationStatus[] | undefined {
    if (!status) return undefined;
    if (status.includes(',')) {
      return status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as VehicleApplicationStatus[];
    }
    return [status as VehicleApplicationStatus];
  }

  private async nextApplicationNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('vehicle_application_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `VA-${String(seq).padStart(4, '0')}`;
  }
}
