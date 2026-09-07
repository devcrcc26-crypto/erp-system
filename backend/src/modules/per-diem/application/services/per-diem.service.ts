import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ApprovalRequestStatus, PerDiemStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
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
import { EmployeePerDiemRateService } from './employee-per-diem-rate.service';
import {
  ListPerDiemRequestsDto,
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
 * Per diem request lifecycle — owns request data; delegates tier workflow to ApprovalsService.
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
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
    private readonly currencyService: CurrencyService,
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
    return this.submitForEmployee(userId, dto, companyId, userId);
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
    const startDate = this.parseDateTime(dto.startDate);
    const endDate = this.parseDateTime(dto.endDate);
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    const startDay = Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
    );
    const endDay = Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
    );
    const totalDays =
      Math.round((endDay - startDay) / 86_400_000) + 1;
    const days = totalDays;

    const resolvedRate =
      await this.employeePerDiemRateService.resolveRateForSubmission(
        companyId,
        employeeId,
        dto.destinationCategory,
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

    const dailyRate = resolvedRate.dailyRate;
    const totalAmount = dailyRate * totalDays;
    const exchangeRate =
      resolvedRate.currency === 'ETB'
        ? 1
        : await this.currencyService.getRate(
            resolvedRate.currency,
            'ETB',
            companyId,
          );
    const totalAmountEtb = totalAmount * exchangeRate;

    const resolvedTiers = await this.hrApprovalChain.buildOrgApprovalChain(
      employeeId,
      companyId,
      true,
    );

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'PER_DIEM',
        title: `Per diem — ${dto.destination} (${dto.startDate} to ${dto.endDate})`,
        formData: {
          destinationCategory: dto.destinationCategory,
          destination: dto.destination,
          startDate: dto.startDate,
          endDate: dto.endDate,
          days,
          totalDays,
          totalAmountEtb,
        },
      },
      companyId,
      employeeId,
      {
        resolvedTiers: {
          ruleName: 'Per diem org chain',
          tiers: resolvedTiers,
        },
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
          destinationCategory: dto.destinationCategory,
          destination: dto.destination.trim(),
          startDate,
          endDate,
          days,
          totalDays,
          dailyRate: new Prisma.Decimal(dailyRate),
          currency: resolvedRate.currency,
          totalAmount: new Prisma.Decimal(totalAmount),
          totalAmountEtb: new Prisma.Decimal(totalAmountEtb),
          exchangeRate: new Prisma.Decimal(exchangeRate),
          linkedFlightId: dto.linkedFlightId ?? null,
          linkedBusinessTripId: dto.linkedBusinessTripId ?? null,
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
    if (request.employeeId !== userId) {
      throw new ForbiddenException('Only the requester can cancel this request');
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

    await this.prisma.perDiemRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        completedAt: decision === 'RETURNED' ? null : now,
        updatedBy: request.employeeId,
      },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertCanView(
    request: {
      employeeId: string;
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

    const isOwner = request.employeeId === userId;
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

  /**
   * Parses an ISO datetime string to a Date.
   */
  private parseDateTime(value: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid datetime: ${value}`);
    }
    return d;
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
}
