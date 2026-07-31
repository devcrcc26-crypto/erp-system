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
  LeaveRequestStatus,
  LeaveType,
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
import {
  ListLeaveRequestsDto,
  SubmitLeaveRequestDto,
} from '../dtos/leave.dtos';
import { LeaveBalanceService } from './leave-balance.service';

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  chineseName: true,
} as const;

const LEAVE_DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  creator: { select: USER_SELECT },
  approvalRequest: {
    include: {
      category: {
        select: { id: true, code: true, name: true, icon: true },
      },
      tiers: {
        include: { approver: { select: USER_SELECT } },
        orderBy: { tierOrder: 'asc' as const },
      },
    },
  },
} as const;

/**
 * Leave request lifecycle — owns leave data; delegates tier workflow to ApprovalsService.
 */
@Injectable()
export class LeaveService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly hrApprovalChain: HrApprovalChainService,
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
   * Creates a leave request, reserves balance, and opens an approval workflow.
   */
  async submitRequest(
    dto: SubmitLeaveRequestDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    this.assertDateRange(dto.startDate, dto.endDate, dto.days);

    const startDate = this.parseDateOnly(dto.startDate);
    const endDate = this.parseDateOnly(dto.endDate);
    const year = startDate.getUTCFullYear();
    const days = dto.days;

    await this.leaveBalanceService.assertSufficientBalance(
      userId,
      dto.leaveType,
      year,
      days,
      companyId,
    );

    const title = `${this.formatLeaveType(dto.leaveType)} leave — ${dto.startDate} to ${dto.endDate}`;

    const resolvedTiers = await this.hrApprovalChain.buildOrgApprovalChain(
      userId,
      companyId,
      days > 3,
    );

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'LEAVE_REQUEST',
        title,
        formData: {
          leaveType: dto.leaveType,
          startDate: dto.startDate,
          endDate: dto.endDate,
          days,
          reason: dto.reason ?? null,
        },
      },
      companyId,
      userId,
      {
        resolvedTiers: {
          ruleName: 'Leave org chain',
          tiers: resolvedTiers,
        },
      },
    )) as { id: string; requestNumber: string };

    const now = new Date();
    const leaveId = randomUUID();

    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.leaveRequest.create({
          data: {
            id: leaveId,
            companyId,
            requestNumber: approval.requestNumber,
            employeeId: userId,
            leaveType: dto.leaveType,
            startDate,
            endDate,
            days: new Prisma.Decimal(days),
            reason: dto.reason?.trim() || null,
            status: LeaveRequestStatus.SUBMITTED,
            approvalRequestId: approval.id,
            submittedAt: now,
            createdBy: userId,
            updatedBy: userId,
          },
        });
      });

      await this.leaveBalanceService.adjustBalance(
        userId,
        dto.leaveType,
        year,
        'pending',
        days,
        companyId,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Leave create failed after approval ${approval.id}; cancelling approval`,
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

    return this.getRequest(leaveId, companyId, userId);
  }

  /**
   * Cancels a DRAFT or SUBMITTED leave request owned by the actor.
   */
  async cancelRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }
    if (leave.employeeId !== userId) {
      throw new ForbiddenException('Only the requester can cancel this leave');
    }
    if (
      leave.status !== LeaveRequestStatus.DRAFT &&
      leave.status !== LeaveRequestStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted leave requests can be cancelled',
      );
    }

    const previousStatus = leave.status;
    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.leaveRequest.update({
        where: { id: leave.id },
        data: {
          status: LeaveRequestStatus.CANCELLED,
          completedAt: now,
          updatedBy: userId,
        },
      });

      if (leave.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: leave.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });

    if (previousStatus === LeaveRequestStatus.SUBMITTED) {
      await this.leaveBalanceService.adjustBalance(
        leave.employeeId,
        leave.leaveType,
        leave.startDate.getUTCFullYear(),
        'pending',
        -Number(leave.days),
        companyId,
      );
    }

    return this.getRequest(id, companyId, userId);
  }

  /**
   * Fetches a leave request with employee and approval tier details.
   * HR viewers see any company request; others must be the employee or a tier approver.
   */
  async getRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: LEAVE_DETAIL_INCLUDE,
    });
    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    await this.assertCanViewLeaveRequest(leave, companyId, userId);

    const mapped = this.mapLeave(leave);
    const year = leave.startDate.getUTCFullYear();
    const balances = (await this.leaveBalanceService.getBalance(
      leave.employeeId,
      year,
      companyId,
    )) as Array<Record<string, unknown>>;
    const balance =
      balances.find((row) => row.leaveType === leave.leaveType) ?? null;

    return {
      ...mapped,
      balance,
    };
  }

  /**
   * Paginated leave requests. HR viewers see company-wide; others see own rows only.
   */
  async listRequests(
    filters: ListLeaveRequestsDto,
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

    const where = activeOnly({
      companyId,
      ...(isHrViewer ? {} : { employeeId: userId }),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(filters.leaveType ? { leaveType: filters.leaveType } : {}),
      ...(isHrViewer && filters.employeeId
        ? { employeeId: filters.employeeId }
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
                reason: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    });

    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: USER_SELECT },
          approvalRequest: {
            select: { id: true, status: true, currentTier: true },
          },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => this.mapLeave(row)),
      total,
      page,
      limit,
    );
  }

  /**
   * Leave requests for the authenticated employee (always employee-scoped).
   */
  async getMyRequests(
    userId: string,
    companyId: string,
    filters: ListLeaveRequestsDto,
  ): Promise<PaginatedResult<unknown>> {
    return this.listRequests(
      { ...filters, employeeId: userId },
      companyId,
      userId,
    );
  }

  /**
   * Ensures the caller may read this leave request.
   */
  private async assertCanViewLeaveRequest(
    leave: {
      employeeId: string;
      approvalRequest?: {
        tiers?: Array<{ approverId: string }>;
      } | null;
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
    if (isHrViewer) {
      return;
    }

    const isOwner = leave.employeeId === userId;
    const isApprover =
      leave.approvalRequest?.tiers?.some((tier) => tier.approverId === userId) ??
      false;

    if (!isOwner && !isApprover) {
      throw new ForbiddenException(
        'You do not have access to this leave request',
      );
    }
  }

  /**
   * Called by the approval engine when a linked request reaches a terminal decision.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!leave) {
      return;
    }

    if (
      leave.status === LeaveRequestStatus.APPROVED ||
      leave.status === LeaveRequestStatus.REJECTED ||
      leave.status === LeaveRequestStatus.CANCELLED
    ) {
      return;
    }

    const year = leave.startDate.getUTCFullYear();
    const days = Number(leave.days);
    const now = new Date();

    let nextStatus: LeaveRequestStatus;
    if (decision === 'APPROVED') {
      nextStatus = LeaveRequestStatus.APPROVED;
    } else if (decision === 'REJECTED') {
      nextStatus = LeaveRequestStatus.REJECTED;
    } else {
      nextStatus = LeaveRequestStatus.RETURNED;
    }

    await this.prisma.leaveRequest.update({
      where: { id: leave.id },
      data: {
        status: nextStatus,
        completedAt:
          decision === 'RETURNED' ? null : now,
        updatedBy: leave.employeeId,
      },
    });

    if (decision === 'APPROVED') {
      await this.leaveBalanceService.adjustBalance(
        leave.employeeId,
        leave.leaveType,
        year,
        'pending',
        -days,
        leave.companyId,
      );
      await this.leaveBalanceService.adjustBalance(
        leave.employeeId,
        leave.leaveType,
        year,
        'used',
        days,
        leave.companyId,
      );
    } else {
      await this.leaveBalanceService.adjustBalance(
        leave.employeeId,
        leave.leaveType,
        year,
        'pending',
        -days,
        leave.companyId,
      );
    }
  }

  private normalizeStatuses(
    status: LeaveRequestStatus | LeaveRequestStatus[] | string | undefined,
  ): LeaveRequestStatus[] | undefined {
    if (!status) {
      return undefined;
    }
    if (Array.isArray(status)) {
      return status.length > 0 ? status : undefined;
    }
    if (typeof status === 'string' && status.includes(',')) {
      return status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as LeaveRequestStatus[];
    }
    return [status as LeaveRequestStatus];
  }

  private assertDateRange(
    startDate: string,
    endDate: string,
    days: number,
  ): void {
    const start = this.parseDateOnly(startDate);
    const end = this.parseDateOnly(endDate);
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    if (days <= 0) {
      throw new BadRequestException('days must be greater than zero');
    }
  }

  private parseDateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private formatLeaveType(leaveType: LeaveType): string {
    return leaveType
      .split('_')
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(' ');
  }

  private mapLeave(row: Record<string, unknown>): Record<string, unknown> {
    const days = row.days;
    return {
      ...row,
      days: days instanceof Prisma.Decimal ? Number(days) : Number(days),
    };
  }
}
