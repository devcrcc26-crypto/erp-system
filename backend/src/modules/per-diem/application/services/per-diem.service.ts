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
  perDiemRate: true,
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
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  /**
   * Submits a new per diem request, resolving rate/amount and opening the approval chain.
   */
  async submitRequest(
    dto: SubmitPerDiemRequestDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const startDate = this.parseDateOnly(dto.startDate);
    const endDate = this.parseDateOnly(dto.endDate);
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    const days =
      Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;

    const rate = await this.prisma.perDiemRate.findFirst({
      where: activeOnly({
        companyId,
        destinationCategory: dto.destinationCategory,
        isActive: true,
      }),
    });
    if (!rate) {
      throw new BadRequestException(
        `No active per diem rate configured for "${dto.destinationCategory}"`,
      );
    }

    if (dto.linkedFlightId) {
      const flight = await this.prisma.flightApplication.findFirst({
        where: activeOnly({
          id: dto.linkedFlightId,
          companyId,
          submittedBy: userId,
        }),
        select: { id: true },
      });
      if (!flight) {
        throw new BadRequestException(
          'linkedFlightId does not reference your own flight application',
        );
      }
    }
    if (dto.linkedBusinessTripId) {
      const trip = await this.prisma.businessTrip.findFirst({
        where: activeOnly({
          id: dto.linkedBusinessTripId,
          companyId,
          submittedBy: userId,
        }),
        select: { id: true },
      });
      if (!trip) {
        throw new BadRequestException(
          'linkedBusinessTripId does not reference your own business trip',
        );
      }
    }

    const dailyRate = Number(rate.dailyRate);
    const totalAmount = dailyRate * days;
    const exchangeRate =
      rate.currency === 'ETB'
        ? 1
        : await this.currencyService.getRate(rate.currency, 'ETB', companyId);
    const totalAmountEtb = totalAmount * exchangeRate;

    const resolvedTiers = await this.hrApprovalChain.buildOrgApprovalChain(
      userId,
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
          totalAmountEtb,
        },
      },
      companyId,
      userId,
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
          employeeId: userId,
          perDiemRateId: rate.id,
          destinationCategory: dto.destinationCategory,
          destination: dto.destination.trim(),
          startDate,
          endDate,
          days,
          dailyRate: new Prisma.Decimal(dailyRate),
          currency: rate.currency,
          totalAmount: new Prisma.Decimal(totalAmount),
          totalAmountEtb: new Prisma.Decimal(totalAmountEtb),
          exchangeRate: new Prisma.Decimal(exchangeRate),
          linkedFlightId: dto.linkedFlightId ?? null,
          linkedBusinessTripId: dto.linkedBusinessTripId ?? null,
          notes: dto.notes?.trim() || null,
          status: PerDiemStatus.SUBMITTED,
          approvalRequestId: approval.id,
          submittedAt: now,
          createdBy: userId,
          updatedBy: userId,
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
          updatedBy: userId,
          completedAt: now,
        },
      });
      throw error;
    }

    return this.getRequest(requestId, companyId, userId);
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
