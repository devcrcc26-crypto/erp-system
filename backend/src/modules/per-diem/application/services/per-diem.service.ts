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
  PerDiemBalanceDirection,
  PerDiemStatus,
  PerDiemTripType,
  Prisma,
  SiteAssignmentStatus,
  SupportedCurrency,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  calendarDaysInclusive,
  parseLocalDateOnly,
  startOfToday,
} from '../../../../shared/utils/date-validation.util';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { assertWithinEmploymentWindow, datesInRange } from '../../../../shared/employment/employment-guard.util';
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
  ALLOWED_UPLOAD_MIME_TYPES,
  STORAGE_BUCKETS,
  STORAGE_SERVICE,
} from '../../../../shared/storage/storage.constants';
import type { IStorageService } from '../../../../shared/storage/storage.interface';
import {
  canViewThroughTeam,
  isEmployeeInTeamScope,
  resolveTeamScopedEmployeeIds,
  teamScopeWhere,
} from '../../../../shared/org/team-scope.util';
import { EmployeePerDiemRateService } from './employee-per-diem-rate.service';
import {
  CreatePerDiemDisbursementDto,
  CreatePerDiemRequestSettlementDto,
  FormalizeRequestSettlementBalanceDto,
  ListPerDiemRequestsDto,
  SubmitPerDiemRequestDto,
  UpdatePerDiemRequestDto,
} from '../dtos/per-diem.dtos';

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

const REQUEST_DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  employeePerDiemRate: true,
  linkedFlight: {
    select: { id: true, applicationNumber: true, destination: true },
  },
  linkedTrip: {
    select: { id: true, tripNumber: true, destinationCity: true, destinationCountry: true },
  },
  settlement: {
    select: { id: true, requestNumber: true, status: true },
  },
  siteAssignment: {
    select: {
      id: true,
      requestNumber: true,
      siteName: true,
      startDate: true,
      endDate: true,
      status: true,
    },
  },
  disbursements: {
    include: {
      disbursedBy: { select: USER_SELECT },
      attachments: {
        include: { uploadedBy: { select: USER_SELECT } },
        orderBy: { uploadedAt: 'asc' as const },
      },
    },
    orderBy: { disbursedAt: 'asc' as const },
  },
  requestSettlement: {
    include: {
      settledBy: { select: USER_SELECT },
      balancePaidBy: { select: USER_SELECT },
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
 * Per diem request lifecycle - owns request data; delegates tier workflow to ApprovalsService.
 */
@Injectable()
export class PerDiemService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PerDiemService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly onBehalfService: OnBehalfService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
    private readonly employeePerDiemRateService: EmployeePerDiemRateService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  /**
   * Submits a new per diem request for the authenticated user.
   */
  async submitRequest(
    dto: SubmitPerDiemRequestDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    return this.submitForEmployee(employeeId, dto, companyId, userId);
  }

  /**
   * Submits a per diem request on behalf of an employee (HR import / proxy).
   */
  async submitOnBehalf(
    employeeId: string,
    dto: SubmitPerDiemRequestDto,
    companyId: string,
    actorUserId: string,
  ): Promise<unknown> {
    const canManage = await this.permissionService.hasPermission(
      actorUserId,
      companyId,
      'per-diem',
      'manage',
    );
    if (!canManage && employeeId !== actorUserId) {
      throw new ForbiddenException(
        'You do not have permission to submit per diem on behalf of this employee',
      );
    }

    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.submitForEmployee(employeeId, dto, companyId, actorUserId);
  }

  /**
   * Validates per diem input and derives dates, days, rate and totals.
   * Shared by submit and edit so both apply the same rules.
   */
  private async resolveSubmission(
    employeeId: string,
    dto: UpdatePerDiemRequestDto,
    companyId: string,
    actorUserId: string,
  ) {
    // Per diem is day-based: only the calendar date portion of each value is used.
    const startDate = this.parseDateOnly(dto.startDate);
    const endDate = this.parseDateOnly(dto.endDate);
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    await assertWithinEmploymentWindow(this.prisma, employeeId, datesInRange(startDate, endDate));
    const calendarSpan = calendarDaysInclusive(startDate, endDate);
    if (dto.days > calendarSpan) {
      throw new BadRequestException(
        `days must be between 1 and ${calendarSpan} (inclusive calendar days from startDate to endDate)`,
      );
    }
    const days = dto.days;
    const totalDays = days;
    const tripType = dto.tripType ?? PerDiemTripType.TRAVEL;
    const destinationCategory =
      tripType === PerDiemTripType.SITE_DEPLOYMENT
        ? 'Domestic'
        : dto.destinationCategory;

    const resolvedRate =
      await this.employeePerDiemRateService.resolveRateForSubmission(
        companyId,
        employeeId,
        destinationCategory,
        actorUserId,
      );

    if (dto.linkedFlightId) {
      const flight = await this.prisma.flightApplication.findFirst({
        where: activeOnly({
          id: dto.linkedFlightId,
          companyId,
          submittedBy: employeeId,
        }),
        select: { id: true },
      });
      if (!flight) {
        throw new BadRequestException(
          'linkedFlightId does not reference this employee\'s flight application',
        );
      }
    }
    if (dto.linkedBusinessTripId) {
      const trip = await this.prisma.businessTrip.findFirst({
        where: activeOnly({
          id: dto.linkedBusinessTripId,
          companyId,
          submittedBy: employeeId,
        }),
        select: { id: true },
      });
      if (!trip) {
        throw new BadRequestException(
          'linkedBusinessTripId does not reference this employee\'s business trip',
        );
      }
    }

    let siteAssignmentId: string | null = null;
    if (dto.siteAssignmentId) {
      if (tripType !== PerDiemTripType.SITE_DEPLOYMENT) {
        throw new BadRequestException(
          'siteAssignmentId is only allowed when tripType is SITE_DEPLOYMENT',
        );
      }
      const assignment = await this.prisma.siteAssignment.findFirst({
        where: activeOnly({
          id: dto.siteAssignmentId,
          companyId,
          employeeId,
          status: SiteAssignmentStatus.APPROVED,
        }),
        select: { id: true },
      });
      if (!assignment) {
        throw new BadRequestException(
          'siteAssignmentId must reference an approved site assignment for this employee',
        );
      }
      siteAssignmentId = assignment.id;
    }

    const dailyRate = resolvedRate.dailyRate;
    const totalAmount = dailyRate * days;
    const exchangeRate = 1;
    const totalAmountEtb = totalAmount;

    return {
      startDate,
      endDate,
      days,
      totalDays,
      tripType,
      destinationCategory,
      resolvedRate,
      siteAssignmentId,
      dailyRate,
      totalAmount,
      exchangeRate,
      totalAmountEtb,
    };
  }

  /**
   * Shared submit path for self-service and on-behalf flows.
   */
  private async submitForEmployee(
    employeeId: string,
    dto: SubmitPerDiemRequestDto,
    companyId: string,
    actorUserId: string,
  ): Promise<unknown> {
    const {
      startDate,
      endDate,
      days,
      totalDays,
      tripType,
      destinationCategory,
      resolvedRate,
      siteAssignmentId,
      dailyRate,
      totalAmount,
      exchangeRate,
      totalAmountEtb,
    } = await this.resolveSubmission(employeeId, dto, companyId, actorUserId);

    const resolvedTiers =
      await this.hrApprovalChain.buildDisciplineLeadSingleTierChain(
        employeeId,
        companyId,
      );

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'PER_DIEM',
        ...this.approvalSnapshot(dto, {
          tripType,
          destinationCategory,
          days,
          totalDays,
          totalAmountEtb,
          siteAssignmentId,
        }),
      },
      companyId,
      employeeId,
      {
        resolvedTiers: {
          ruleName: 'Per diem Discipline Lead chain',
          tiers: resolvedTiers,
        },
        createdByUserId: actorUserId,
      },
    )) as { id: string; requestNumber: string };

    const requestId = randomUUID();
    const now = new Date();

    try {
      await this.prisma.perDiemRequest.create({
        data: {
          id: requestId,
          companyId,
          requestNumber: approval.requestNumber,
          employeeId,
          employeePerDiemRateId: resolvedRate.employeePerDiemRateId,
          destinationCategory,
          destination: dto.destination.trim(),
          tripType,
          startDate,
          endDate,
          departureTime: dto.departureTime ?? null,
          returnTime: dto.returnTime ?? null,
          days,
          totalDays,
          dailyRate: new Prisma.Decimal(dailyRate),
          requestedDailyRate:
            dto.requestedDailyRate != null
              ? new Prisma.Decimal(dto.requestedDailyRate)
              : null,
          rateOverrideReason: dto.rateOverrideReason?.trim() || null,
          currency: SupportedCurrency.ETB,
          totalAmount: new Prisma.Decimal(totalAmount),
          totalAmountEtb: new Prisma.Decimal(totalAmountEtb),
          exchangeRate: new Prisma.Decimal(exchangeRate),
          linkedFlightId: dto.linkedFlightId ?? null,
          linkedBusinessTripId: dto.linkedBusinessTripId ?? null,
          siteAssignmentId,
          notes: dto.notes?.trim() || null,
          status: PerDiemStatus.SUBMITTED,
          approvalRequestId: approval.id,
          submittedAt: now,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Per diem request create failed after approval ${approval.id}; cancelling approval`,
        error instanceof Error ? error.message : String(error),
      );
      await this.prisma.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: ApprovalRequestStatus.CANCELLED,
          updatedBy: actorUserId,
          completedAt: now,
        },
      });
      throw error;
    }

    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'PER_DIEM',
      companyId,
      actorUserId,
      employeeId,
      recordId: requestId,
      recordReference: approval.requestNumber,
      autoApproveTier: dto.autoApproveTier,
    });
    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'PER_DIEM',
      companyId,
      actorUserId,
      employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: dto.autoApproveTier === true,
    });

    return this.getRequest(requestId, companyId, actorUserId);
  }

  /**
   * Employee edits their own DRAFT or RETURNED per diem request. Inputs are
   * re-validated and the rate re-resolved exactly as on submit.
   * Saves only: status is unchanged; a
   * RETURNED request is resubmitted separately from Approvals.
   */
  async updateRequest(
    id: string,
    dto: UpdatePerDiemRequestDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.perDiemRequest.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!request) {
      throw new NotFoundException('Per diem request not found');
    }
    if (request.employeeId !== userId) {
      throw new ForbiddenException('You can only edit your own requests.');
    }
    if (
      (request.status !== PerDiemStatus.DRAFT &&
        request.status !== PerDiemStatus.RETURNED) ||
      request.settlementId
    ) {
      throw new ForbiddenException('This request can no longer be edited.');
    }

    const resolved = await this.resolveSubmission(
      request.employeeId,
      dto,
      companyId,
      userId,
    );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.perDiemRequest.update({
        where: { id },
        data: {
          employeePerDiemRateId: resolved.resolvedRate.employeePerDiemRateId,
          destinationCategory: resolved.destinationCategory,
          destination: dto.destination.trim(),
          tripType: resolved.tripType,
          startDate: resolved.startDate,
          endDate: resolved.endDate,
          departureTime: dto.departureTime ?? null,
          returnTime: dto.returnTime ?? null,
          days: resolved.days,
          totalDays: resolved.totalDays,
          dailyRate: new Prisma.Decimal(resolved.dailyRate),
          requestedDailyRate:
            dto.requestedDailyRate != null
              ? new Prisma.Decimal(dto.requestedDailyRate)
              : null,
          rateOverrideReason: dto.rateOverrideReason?.trim() || null,
          totalAmount: new Prisma.Decimal(resolved.totalAmount),
          totalAmountEtb: new Prisma.Decimal(resolved.totalAmountEtb),
          exchangeRate: new Prisma.Decimal(resolved.exchangeRate),
          linkedFlightId: dto.linkedFlightId ?? null,
          linkedBusinessTripId: dto.linkedBusinessTripId ?? null,
          siteAssignmentId: resolved.siteAssignmentId,
          notes: dto.notes?.trim() || null,
          updatedBy: userId,
        },
      });
      if (request.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: request.approvalRequestId },
          data: {
            ...this.approvalSnapshot(dto, resolved),
            updatedBy: userId,
          },
        });
      }
    });

    return this.getRequest(id, companyId, userId);
  }

  /** Approval title + formData mirrored from the per diem request. */
  private approvalSnapshot(
    dto: UpdatePerDiemRequestDto,
    resolved: {
      tripType: PerDiemTripType;
      destinationCategory: string;
      days: number;
      totalDays: number;
      totalAmountEtb: number;
      siteAssignmentId: string | null;
    },
  ) {
    return {
      title: `Per diem - ${dto.destination} (${dto.startDate} to ${dto.endDate})`,
      formData: {
        tripType: resolved.tripType,
        destinationCategory: resolved.destinationCategory,
        destination: dto.destination,
        startDate: dto.startDate,
        endDate: dto.endDate,
        departureTime: dto.departureTime ?? null,
        returnTime: dto.returnTime ?? null,
        days: resolved.days,
        totalDays: resolved.totalDays,
        totalAmountEtb: resolved.totalAmountEtb,
        siteAssignmentId: resolved.siteAssignmentId,
      },
    };
  }

  async getRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.perDiemRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: REQUEST_DETAIL_INCLUDE,
    });
    if (!request) {
      throw new NotFoundException('Per diem request not found');
    }

    await this.assertCanView(request, companyId, userId);
    const mapped = await this.mapRequestDetail(request);
    const canDisburse = await this.canDisburse(
      request.employeeId,
      companyId,
      userId,
    );
    return { ...mapped, canDisburse };
  }

  async listRequests(
    filters: ListPerDiemRequestsDto,
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
      'per-diem',
      'manage',
    );

    const teamEmployeeIds = canManage
      ? null
      : await resolveTeamScopedEmployeeIds(this.prisma, userId, companyId);

    const where: Prisma.PerDiemRequestWhereInput = {
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
                requestNumber: {
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
            startDate: {
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
      this.prisma.perDiemRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: USER_SELECT },
          _count: { select: { disbursements: true } },
          settlement: {
            select: { id: true, requestNumber: true, status: true },
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
      this.prisma.perDiemRequest.count({ where }),
    ]);

    const data = rows.map((row) => {
      const { _count, ...rest } = row as typeof row & {
        _count?: { disbursements: number };
      };
      return {
        ...rest,
        disbursementCount: _count?.disbursements ?? 0,
      };
    });

    return buildPaginatedResult(data, total, page, limit);
  }

  async cancelRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.perDiemRequest.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!request) {
      throw new NotFoundException('Per diem request not found');
    }
    if (request.employeeId !== userId && request.createdBy !== userId) {
      throw new ForbiddenException(
        'Only the employee or the person who submitted on their behalf can cancel this request',
      );
    }
    if (request.settlementId) {
      throw new BadRequestException(
        'This advance is included in a settlement and cannot be cancelled or edited',
      );
    }
    if (
      request.status !== PerDiemStatus.DRAFT &&
      request.status !== PerDiemStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted requests can be cancelled',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.perDiemRequest.update({
        where: { id },
        data: {
          status: PerDiemStatus.CANCELLED,
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
   * Records a cash disbursement against an approved/active per diem request.
   * The first disbursement transitions the request to ACTIVE.
   */
  async addDisbursement(
    id: string,
    dto: CreatePerDiemDisbursementDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.perDiemRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: { disbursements: { select: { amount: true } } },
    });
    if (!request) {
      throw new NotFoundException('Per diem request not found');
    }
    await this.assertCanDisburse(request.employeeId, companyId, userId);
    if (
      request.status !== PerDiemStatus.APPROVED &&
      request.status !== PerDiemStatus.ACTIVE
    ) {
      throw new BadRequestException(
        'Disbursements can only be added to approved or active requests',
      );
    }

    const coveredFrom = this.parseDateOnly(dto.coveredDaysFrom);
    const coveredTo = this.parseDateOnly(dto.coveredDaysTo);
    if (coveredTo.getTime() < coveredFrom.getTime()) {
      throw new BadRequestException(
        'coveredDaysTo must be on or after coveredDaysFrom',
      );
    }

    const approvedRate = request.approvedDailyRate ?? request.dailyRate;
    if (approvedRate == null) {
      throw new BadRequestException(
        'Approved daily rate is required before recording a disbursement',
      );
    }
    const days = calendarDaysInclusive(coveredFrom, coveredTo);
    const amount = new Prisma.Decimal(approvedRate.toString()).mul(days);
    // The approved total (approved rate × approved days) is the ceiling.
    const approvedTotal = new Prisma.Decimal(approvedRate.toString()).mul(
      request.days,
    );
    const alreadyDisbursed = request.disbursements.reduce(
      (sum, row) => sum.add(row.amount),
      new Prisma.Decimal(0),
    );
    const remaining = approvedTotal.sub(alreadyDisbursed);
    if (amount.greaterThan(remaining)) {
      throw new BadRequestException(
        `This disbursement (${amount.toFixed(2)} ETB) exceeds the remaining approved amount (${remaining.toFixed(2)} ETB of ${approvedTotal.toFixed(2)} ETB)`,
      );
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.perDiemDisbursement.create({
        data: {
          id: randomUUID(),
          requestId: id,
          amount,
          disbursedAt: new Date(dto.disbursedAt),
          coveredDaysFrom: coveredFrom,
          coveredDaysTo: coveredTo,
          disbursedById: userId,
          notes: dto.notes?.trim() || null,
        },
      });

      await tx.perDiemRequest.update({
        where: { id },
        data: {
          ...(request.status === PerDiemStatus.APPROVED
            ? {
                status: PerDiemStatus.ACTIVE,
                actualStartDate: coveredFrom,
              }
            : {}),
          updatedBy: userId,
        },
      });
    });

    return this.getRequest(id, companyId, userId);
  }

  /**
   * Uploads a receipt attachment for a disbursement on a per diem request.
   */
  async uploadDisbursementAttachment(
    requestId: string,
    disbursementId: string,
    file: UploadedFile,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
    }

    const parentRequest = await this.prisma.perDiemRequest.findFirst({
      where: activeOnly({ id: requestId, companyId }),
      select: { employeeId: true },
    });
    if (!parentRequest) {
      throw new NotFoundException('Per diem request not found');
    }
    await this.assertCanDisburse(parentRequest.employeeId, companyId, userId);

    const disbursement = await this.prisma.perDiemDisbursement.findFirst({
      where: {
        id: disbursementId,
        request: activeOnly({ id: requestId, companyId }),
      },
      select: { id: true },
    });
    if (!disbursement) {
      throw new NotFoundException('Disbursement not found for this request');
    }

    const attachmentId = randomUUID();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `${companyId}/hr/per-diem/${requestId}/disbursements/${disbursementId}/${attachmentId}_${safeName}`;

    await this.storage.upload({
      bucket: STORAGE_BUCKETS.HR,
      key: fileKey,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
    });

    await this.prisma.perDiemDisbursementAttachment.create({
      data: {
        id: attachmentId,
        disbursementId,
        fileName: file.originalname,
        fileUrl: fileKey,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById: userId,
      },
    });

    return this.getRequest(requestId, companyId, userId);
  }

  /**
   * Settles an ACTIVE per diem request by calculating earned vs. disbursed amounts.
   */
  async settleRequest(
    id: string,
    dto: CreatePerDiemRequestSettlementDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'per-diem',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException('Missing permission: per-diem.manage');
    }

    const request = await this.prisma.perDiemRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        disbursements: { select: { amount: true } },
        requestSettlement: { select: { id: true } },
      },
    });
    if (!request) {
      throw new NotFoundException('Per diem request not found');
    }
    if (request.status !== PerDiemStatus.ACTIVE) {
      throw new BadRequestException('Only active requests can be settled');
    }
    if (request.requestSettlement) {
      throw new BadRequestException('This request has already been settled');
    }

    const actualReturnDate = this.parseDateOnly(dto.actualReturnDate);
    const baseDate = request.actualStartDate ?? request.startDate;
    const calculatedDays = calendarDaysInclusive(baseDate, actualReturnDate);
    const actualDays = dto.actualDaysOverride ?? calculatedDays;

    // Earned at the approved rate (falls back to the standard rate).
    const dailyRate = Number(request.approvedDailyRate ?? request.dailyRate);
    const earnedTotal = actualDays * dailyRate;
    const totalDisbursed = request.disbursements.reduce(
      (sum, d) => sum + Number(d.amount),
      0,
    );
    const balance = earnedTotal - totalDisbursed;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.perDiemRequestSettlement.create({
        data: {
          id: randomUUID(),
          requestId: id,
          actualReturnDate,
          actualDays,
          earnedTotal: new Prisma.Decimal(earnedTotal),
          totalDisbursed: new Prisma.Decimal(totalDisbursed),
          balance: new Prisma.Decimal(balance),
          settledById: userId,
          notes: dto.notes?.trim() || null,
        },
      });

      await tx.perDiemRequest.update({
        where: { id },
        data: {
          status: PerDiemStatus.SETTLED,
          completedAt: new Date(),
          updatedBy: userId,
        },
      });
    });

    return this.getRequest(id, companyId, userId);
  }

  /**
   * Records formal settlement of the remaining balance (payment to employee or cash returned to company).
   */
  async formalizeRequestSettlementBalance(
    requestId: string,
    dto: FormalizeRequestSettlementBalanceDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'per-diem',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException('Missing permission: per-diem.manage');
    }

    const request = await this.prisma.perDiemRequest.findFirst({
      where: activeOnly({ id: requestId, companyId }),
      include: { requestSettlement: true },
    });
    if (!request) {
      throw new NotFoundException('Per diem request not found');
    }
    if (!request.requestSettlement) {
      throw new BadRequestException('This request has not been settled yet');
    }
    const settlement = request.requestSettlement;
    if (settlement.balancePaidAt) {
      throw new BadRequestException('Settlement balance has already been formalized');
    }
    const balanceAmount = Number(settlement.balance);
    if (balanceAmount === 0) {
      throw new BadRequestException('There is no balance to formalize');
    }

    await this.prisma.perDiemRequestSettlement.update({
      where: { id: settlement.id },
      data: {
        balancePaymentReference: dto.paymentReference.trim(),
        balancePaymentDate: this.parseDateOnly(dto.paymentDate),
        balancePaidAt: new Date(),
        balancePaidById: userId,
      },
    });

    return this.getRequest(requestId, companyId, userId);
  }

  /**
   * Lists request-level settlements (ACTIVE settle flow) for the settlements tab.
   */
  async listRequestSettlements(
    page: number,
    limit: number,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const { skip, take } = buildPrismaPagination(page, limit);
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'per-diem',
      'manage',
    );

    const where: Prisma.PerDiemRequestSettlementWhereInput = {
      request: {
        companyId,
        deletedAt: null,
        ...(canManage ? {} : { employeeId: userId }),
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.perDiemRequestSettlement.findMany({
        where,
        skip,
        take,
        orderBy: { settledAt: 'desc' },
        include: {
          request: {
            select: {
              id: true,
              requestNumber: true,
              destination: true,
              destinationCategory: true,
              employeeId: true,
              status: true,
              employee: { select: USER_SELECT },
            },
          },
        },
      }),
      this.prisma.perDiemRequestSettlement.count({ where }),
    ]);

    const data = rows.map((row) => {
      const balanceAmount = Number(row.balance);
      const { balance, balanceDirection } =
        this.mapRequestSettlementBalance(balanceAmount);
      return {
        settlementKind: 'REQUEST' as const,
        id: row.id,
        requestId: row.requestId,
        companyId,
        requestNumber: row.request.requestNumber,
        employeeId: row.request.employeeId,
        destination: row.request.destination,
        destinationCategory: row.request.destinationCategory,
        actualReturnDate: row.actualReturnDate,
        actualDays: row.actualDays,
        perDiemEarned: row.earnedTotal,
        totalAdvances: row.totalDisbursed,
        balance,
        balanceDirection,
        status: PerDiemStatus.SETTLED,
        balancePaidAt: row.balancePaidAt,
        employee: row.request.employee,
        createdAt: row.settledAt,
      };
    });

    return buildPaginatedResult(data, total, page, limit);
  }

  private mapRequestSettlementBalance(balanceAmount: number): {
    balance: Prisma.Decimal;
    balanceDirection: PerDiemBalanceDirection;
  } {
    if (balanceAmount > 0) {
      return {
        balance: new Prisma.Decimal(balanceAmount),
        balanceDirection: PerDiemBalanceDirection.TO_EMPLOYEE,
      };
    }
    if (balanceAmount < 0) {
      return {
        balance: new Prisma.Decimal(Math.abs(balanceAmount)),
        balanceDirection: PerDiemBalanceDirection.TO_COMPANY,
      };
    }
    return {
      balance: new Prisma.Decimal(0),
      balanceDirection: PerDiemBalanceDirection.NONE,
    };
  }

  /**
   * Sets the approved daily rate on a pending per diem request (called by the
   * approver before confirming). The approved total (approved rate × days) is
   * stored as the request total, so disbursement and settlement use it; the
   * standard figure stays available as dailyRate × days.
   */
  async setApprovedRate(
    id: string,
    approvedDailyRate: number,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.perDiemRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        approvalRequest: {
          select: {
            currentTier: true,
            tiers: { select: { tierOrder: true, approverId: true, decision: true } },
          },
        },
      },
    });
    if (!request) {
      throw new NotFoundException('Per diem request not found');
    }
    // Only the approver of the current tier (or per-diem.manage, e.g. approving
    // on behalf) may set the rate - never the employee for their own request.
    const currentTier = request.approvalRequest?.tiers.find(
      (tier) => tier.tierOrder === request.approvalRequest?.currentTier,
    );
    const isCurrentApprover =
      currentTier?.approverId === userId && request.employeeId !== userId;
    if (
      !isCurrentApprover &&
      !(await this.permissionService.hasPermission(
        userId,
        companyId,
        'per-diem',
        'manage',
      ))
    ) {
      throw new ForbiddenException(
        'Only the current approver can set the approved rate',
      );
    }
    if (
      request.status !== PerDiemStatus.SUBMITTED &&
      request.status !== PerDiemStatus.IN_REVIEW
    ) {
      throw new BadRequestException(
        'The approved rate can only be set while the request awaits approval',
      );
    }
    if (!(approvedDailyRate > 0)) {
      throw new BadRequestException('Approved daily rate must be greater than 0');
    }
    const approvedRate = new Prisma.Decimal(approvedDailyRate);
    const approvedTotal = approvedRate.mul(request.days);
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.perDiemRequest.update({
        where: { id },
        data: {
          approvedDailyRate: approvedRate,
          totalAmount: approvedTotal,
          totalAmountEtb: approvedTotal,
          updatedBy: request.updatedBy,
        },
      });
      if (request.approvalRequestId) {
        const approval = await tx.approvalRequest.findFirst({
          where: { id: request.approvalRequestId },
          select: { formData: true },
        });
        await tx.approvalRequest.update({
          where: { id: request.approvalRequestId },
          data: {
            formData: {
              ...((approval?.formData ?? {}) as Prisma.JsonObject),
              approvedDailyRate: Number(approvedRate),
              totalAmountEtb: Number(approvedTotal),
            },
          },
        });
      }
    });
    return this.getRequest(id, companyId, request.employeeId);
  }

  /**
   * Called by the approval engine when a linked request reaches a terminal decision.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const request = await this.prisma.perDiemRequest.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!request) {
      return;
    }
    if (
      request.status === PerDiemStatus.APPROVED ||
      request.status === PerDiemStatus.REJECTED ||
      request.status === PerDiemStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    const nextStatus =
      decision === 'APPROVED'
        ? PerDiemStatus.APPROVED
        : decision === 'REJECTED'
          ? PerDiemStatus.REJECTED
          : PerDiemStatus.RETURNED;

    const pvNumber =
      decision === 'APPROVED' && !request.pvNumber
        ? await this.nextPvNumber()
        : request.pvNumber;

    await this.prisma.perDiemRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        completedAt: decision === 'RETURNED' ? null : now,
        updatedBy: request.employeeId,
        ...(decision === 'APPROVED' && pvNumber
          ? {
              pvNumber,
              pvDate: request.pvDate ?? startOfToday(),
            }
          : {}),
      },
    });
  }

  /**
   * Next payment-voucher number. Uses the same PostgreSQL sequence pattern
   * as leave (`LR-`) and overtime (`OT-`) request numbers.
   */
  private async nextPvNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('per_diem_pv_number_seq')
    `;
    const seq = Number(result[0]?.nextval ?? 1);
    return `PV-${String(seq).padStart(4, '0')}`;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Adds presigned download URLs for disbursement receipt attachments.
   */
  private async mapRequestDetail(request: {
    disbursements?: Array<{
      attachments?: Array<{ fileUrl: string } & Record<string, unknown>>;
    }>;
  } & Record<string, unknown>): Promise<Record<string, unknown>> {
    const disbursements = request.disbursements ?? [];
    const mappedDisbursements = await Promise.all(
      disbursements.map(async (row) => {
        const attachments = row.attachments ?? [];
        const mappedAttachments = await Promise.all(
          attachments.map(async (attachment) => ({
            ...attachment,
            fileUrl: await this.storage.getPresignedDownloadUrl(
              STORAGE_BUCKETS.HR,
              attachment.fileUrl,
            ),
          })),
        );
        return { ...row, attachments: mappedAttachments };
      }),
    );
    return { ...request, disbursements: mappedDisbursements };
  }

  private async assertCanView(
    request: {
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
      'per-diem',
      'manage',
    );
    if (canManage) return;

    const isOwner = request.employeeId === userId || request.createdBy === userId;
    const isTierApprover =
      // Cancelled requests are hidden from the approval chain.
      request.status !== 'CANCELLED' &&
      (request.approvalRequest?.tiers?.some((t) => t.approverId === userId) ??
      false);
    const inTeamScope =
      !isOwner &&
      (await canViewThroughTeam(this.prisma, userId, companyId, request));

    if (!isOwner && !isTierApprover && !inTeamScope) {
      throw new ForbiddenException(
        'You do not have access to this per diem request',
      );
    }
  }

  /**
   * HR with per-diem.manage, or a supervisor/leader who has the employee
   * in their team scope, may record disbursements.
   */
  private async canDisburse(
    employeeId: string,
    companyId: string,
    userId: string,
  ): Promise<boolean> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'per-diem',
      'manage',
    );
    if (canManage) {
      return true;
    }
    if (employeeId === userId) {
      return false;
    }
    return isEmployeeInTeamScope(this.prisma, userId, companyId, employeeId);
  }

  private async assertCanDisburse(
    employeeId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    if (await this.canDisburse(employeeId, companyId, userId)) {
      return;
    }
    throw new ForbiddenException(
      'You do not have permission to disburse this per diem request',
    );
  }

  private normalizeStatuses(
    status: string | undefined,
  ): PerDiemStatus[] | undefined {
    if (!status) return undefined;
    if (status.includes(',')) {
      return status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as PerDiemStatus[];
    }
    return [status as PerDiemStatus];
  }

  private parseDateOnly(value: string): Date {
    try {
      return parseLocalDateOnly(value);
    } catch {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
  }
}
