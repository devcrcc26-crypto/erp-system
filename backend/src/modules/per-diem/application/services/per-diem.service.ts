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
import { EmployeePerDiemRateService } from './employee-per-diem-rate.service';
import {
  ListPerDiemRequestsDto,
  MarkPerDiemPaidDto,
  SubmitPerDiemRequestDto,
} from '../dtos/per-diem.dtos';

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
  payer: { select: USER_SELECT },
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
    const isHrViewer = await this.permissionService.hasPermission(
      actorUserId,
      companyId,
      'hr',
      'view',
    );
    if (!isHrViewer && employeeId !== actorUserId) {
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
   * Shared submit path for self-service and on-behalf flows.
   */
  private async submitForEmployee(
    employeeId: string,
    dto: SubmitPerDiemRequestDto,
    companyId: string,
    actorUserId: string,
  ): Promise<unknown> {
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

    const resolvedTiers =
      await this.hrApprovalChain.buildDisciplineLeadSingleTierChain(
        employeeId,
        companyId,
      );

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'PER_DIEM',
        title: `Per diem - ${dto.destination} (${dto.startDate} to ${dto.endDate})`,
        formData: {
          tripType,
          destinationCategory,
          destination: dto.destination,
          startDate: dto.startDate,
          endDate: dto.endDate,
          departureTime: dto.departureTime ?? null,
          returnTime: dto.returnTime ?? null,
          days,
          totalDays,
          totalAmountEtb,
          siteAssignmentId,
        },
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
    return request;
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

    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );

    const where: Prisma.PerDiemRequestWhereInput = {
      companyId,
      deletedAt: null,
      ...(isHrViewer ? {} : { employeeId: userId }),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(isHrViewer && filters.employeeId
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

    return buildPaginatedResult(rows, total, page, limit);
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
   * Marks an APPROVED advance as paid. HR with per-diem.edit or hr.edit.
   */
  async markPaid(
    id: string,
    dto: MarkPerDiemPaidDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const [canEditPerDiem, canEditHr] = await Promise.all([
      this.permissionService.hasPermission(
        userId,
        companyId,
        'per-diem',
        'edit',
      ),
      this.permissionService.hasPermission(userId, companyId, 'hr', 'edit'),
    ]);
    if (!canEditPerDiem && !canEditHr) {
      throw new ForbiddenException(
        'Missing permission (any of): per-diem.edit, hr.edit',
      );
    }

    const request = await this.prisma.perDiemRequest.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!request) {
      throw new NotFoundException('Per diem request not found');
    }
    if (request.status !== PerDiemStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved advances can be marked as paid',
      );
    }
    if (request.paidAt) {
      throw new BadRequestException('This advance is already marked as paid');
    }
    if (request.settlementId) {
      throw new BadRequestException(
        'This advance is already linked to a settlement',
      );
    }

    const paidAmount =
      dto.paidAmount != null
        ? new Prisma.Decimal(dto.paidAmount)
        : request.totalAmount;

    await this.prisma.perDiemRequest.update({
      where: { id },
      data: {
        paidAt: new Date(),
        paidBy: userId,
        paidAmount,
        paymentReference: dto.paymentReference?.trim() || null,
        updatedBy: userId,
      },
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

  private async assertCanView(
    request: {
      employeeId: string;
      createdBy?: string;
      approvalRequest?: { tiers?: Array<{ approverId: string }> } | null;
    },
    companyId: string,
    userId: string,
  ): Promise<void> {
    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
    if (isHrViewer) return;

    const isOwner = request.employeeId === userId || request.createdBy === userId;
    const isTierApprover =
      request.approvalRequest?.tiers?.some((t) => t.approverId === userId) ??
      false;

    if (!isOwner && !isTierApprover) {
      throw new ForbiddenException(
        'You do not have access to this per diem request',
      );
    }
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
