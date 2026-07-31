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
  OvertimeStatus,
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
  ListOvertimeRequestsDto,
  SubmitOvertimeRequestDto,
} from '../dtos/overtime.dtos';

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  chineseName: true,
} as const;

const PROJECT_SELECT = {
  id: true,
  projectCode: true,
  name: true,
  nameZh: true,
} as const;

const OVERTIME_DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  creator: { select: USER_SELECT },
  project: { select: PROJECT_SELECT },
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
 * Overtime request lifecycle — owns overtime data; delegates tiers to ApprovalsService.
 */
@Injectable()
export class OvertimeService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OvertimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
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
   * Creates an overtime request and opens an approval workflow.
   */
  async submitRequest(
    dto: SubmitOvertimeRequestDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const date = this.parseDateOnly(dto.date);
    const startTime = this.parseTimeOfDay(dto.startTime);
    const endTime = this.parseTimeOfDay(dto.endTime);
    const calculatedHours = this.calculateHours(startTime, endTime);

    if (Math.abs(calculatedHours - dto.hours) > 0.1) {
      throw new BadRequestException(
        `hours (${dto.hours}) does not match start/end time span (${calculatedHours})`,
      );
    }

    const hours = calculatedHours;

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: activeOnly({ id: dto.projectId, companyId }),
        select: { id: true },
      });
      if (!project) {
        throw new BadRequestException('Project not found');
      }
    }

    const title = `Overtime — ${dto.date} (${hours}h)`;

    const resolvedTiers = await this.hrApprovalChain.buildOrgApprovalChain(
      userId,
      companyId,
      hours > 4,
    );

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'OVERTIME_APPLICATION',
        title,
        formData: {
          date: dto.date,
          startTime: dto.startTime,
          endTime: dto.endTime,
          hours,
          reason: dto.reason.trim(),
          projectId: dto.projectId ?? null,
          compensationType: dto.compensationType ?? null,
        },
      },
      companyId,
      userId,
      {
        resolvedTiers: {
          ruleName: 'Overtime org chain',
          tiers: resolvedTiers,
        },
      },
    )) as { id: string; requestNumber: string };

    const now = new Date();
    const overtimeId = randomUUID();

    try {
      await this.prisma.overtimeRequest.create({
        data: {
          id: overtimeId,
          companyId,
          requestNumber: approval.requestNumber,
          employeeId: userId,
          date,
          startTime,
          endTime,
          hours: new Prisma.Decimal(hours),
          reason: dto.reason.trim(),
          projectId: dto.projectId ?? null,
          compensationType: dto.compensationType ?? null,
          status: OvertimeStatus.SUBMITTED,
          approvalRequestId: approval.id,
          submittedAt: now,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Overtime create failed after approval ${approval.id}; cancelling approval`,
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

    return this.getRequest(overtimeId, companyId, userId);
  }

  /**
   * Cancels a DRAFT or SUBMITTED overtime request owned by the actor.
   */
  async cancelRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const row = await this.prisma.overtimeRequest.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!row) {
      throw new NotFoundException('Overtime request not found');
    }
    if (row.employeeId !== userId) {
      throw new ForbiddenException(
        'Only the requester can cancel this overtime request',
      );
    }
    if (
      row.status !== OvertimeStatus.DRAFT &&
      row.status !== OvertimeStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted overtime requests can be cancelled',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.overtimeRequest.update({
        where: { id: row.id },
        data: {
          status: OvertimeStatus.CANCELLED,
          completedAt: now,
          updatedBy: userId,
        },
      });

      if (row.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: row.approvalRequestId },
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
   * Fetches an overtime request with employee, project, and approval tiers.
   * HR viewers see any company request; others must be the employee or a tier approver.
   */
  async getRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const row = await this.prisma.overtimeRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: OVERTIME_DETAIL_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Overtime request not found');
    }

    await this.assertCanViewOvertimeRequest(row, companyId, userId);
    return this.mapOvertime(row);
  }

  /**
   * Paginated overtime requests. HR viewers see company-wide; others see own rows only.
   */
  async listRequests(
    filters: ListOvertimeRequestsDto,
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
      ...(isHrViewer && filters.employeeId
        ? { employeeId: filters.employeeId }
        : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            date: {
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
      this.prisma.overtimeRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: USER_SELECT },
          project: { select: PROJECT_SELECT },
          approvalRequest: {
            select: { id: true, status: true, currentTier: true },
          },
        },
      }),
      this.prisma.overtimeRequest.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => this.mapOvertime(row)),
      total,
      page,
      limit,
    );
  }

  /**
   * Overtime requests for the authenticated employee (always employee-scoped).
   */
  async getMyRequests(
    userId: string,
    companyId: string,
    filters: ListOvertimeRequestsDto,
  ): Promise<PaginatedResult<unknown>> {
    return this.listRequests(
      { ...filters, employeeId: userId },
      companyId,
      userId,
    );
  }

  /**
   * Ensures the caller may read this overtime request.
   */
  private async assertCanViewOvertimeRequest(
    row: {
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

    const isOwner = row.employeeId === userId;
    const isApprover =
      row.approvalRequest?.tiers?.some((tier) => tier.approverId === userId) ??
      false;

    if (!isOwner && !isApprover) {
      throw new ForbiddenException(
        'You do not have access to this overtime request',
      );
    }
  }

  /**
   * Called when a linked approval request reaches a terminal decision.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const row = await this.prisma.overtimeRequest.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!row) {
      return;
    }

    if (
      row.status === OvertimeStatus.APPROVED ||
      row.status === OvertimeStatus.REJECTED ||
      row.status === OvertimeStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    let nextStatus: OvertimeStatus;
    if (decision === 'APPROVED') {
      nextStatus = OvertimeStatus.APPROVED;
    } else if (decision === 'REJECTED') {
      nextStatus = OvertimeStatus.REJECTED;
    } else {
      nextStatus = OvertimeStatus.RETURNED;
    }

    await this.prisma.overtimeRequest.update({
      where: { id: row.id },
      data: {
        status: nextStatus,
        completedAt: decision === 'RETURNED' ? null : now,
        updatedBy: row.employeeId,
      },
    });
  }

  private normalizeStatuses(
    status: OvertimeStatus | OvertimeStatus[] | string | undefined,
  ): OvertimeStatus[] | undefined {
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
        .filter(Boolean) as OvertimeStatus[];
    }
    return [status as OvertimeStatus];
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

  private parseTimeOfDay(value: string): Date {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) {
      throw new BadRequestException(`Invalid time: ${value}`);
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      throw new BadRequestException(`Invalid time: ${value}`);
    }
    return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
  }

  private calculateHours(start: Date, end: Date): number {
    let ms = end.getTime() - start.getTime();
    if (ms <= 0) {
      ms += 24 * 60 * 60 * 1000;
    }
    return Math.round((ms / 3_600_000) * 10) / 10;
  }

  private formatTimeOfDay(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private mapOvertime(row: Record<string, unknown>): Record<string, unknown> {
    const hours = row.hours;
    const startTime = row.startTime;
    const endTime = row.endTime;
    return {
      ...row,
      hours: hours instanceof Prisma.Decimal ? Number(hours) : Number(hours),
      startTime:
        startTime instanceof Date || typeof startTime === 'string'
          ? this.formatTimeOfDay(startTime)
          : startTime,
      endTime:
        endTime instanceof Date || typeof endTime === 'string'
          ? this.formatTimeOfDay(endTime)
          : endTime,
    };
  }
}
