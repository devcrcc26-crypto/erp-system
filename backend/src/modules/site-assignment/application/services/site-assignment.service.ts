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
  Prisma,
  SiteAssignmentStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  buildPaginatedResult,
  buildPrismaPagination,
} from '../../../../shared/utils/pagination.util';
import { AttendanceService } from '../../../attendance/application/services/attendance.service';
import { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import type {
  ApprovalDecisionListener,
  ApprovalFinalDecision,
} from '../../../approvals/application/ports/approval-decision.listener';
import { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import { formatDateOnly } from '../../../work-schedule/application/services/work-schedule.dates';
import {
  ListSiteAssignmentsDto,
  ShortenSiteAssignmentDto,
  SubmitSiteAssignmentDto,
} from '../dtos/site-assignment.dtos';
import {
  calendarDaysInclusive,
  monthsTouchedByRange,
  parseUtcDateOnly,
  rangesOverlap,
  validateSiteAssignmentDates,
} from '../utils/site-assignment.util';

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  employeeId: true,
  chineseName: true,
} as const;

const DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  creator: { select: USER_SELECT },
  project: {
    select: { id: true, projectCode: true, name: true },
  },
  perDiemRequests: {
    where: { deletedAt: null },
    select: {
      id: true,
      requestNumber: true,
      destination: true,
      status: true,
      startDate: true,
      endDate: true,
      totalAmountEtb: true,
      paidAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
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

const TERMINAL_OVERLAP_STATUSES: SiteAssignmentStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'RETURNED',
];

/**
 * Site assignment requests — remote project work without HQ scanner coverage.
 */
@Injectable()
export class SiteAssignmentService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SiteAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly onBehalfService: OnBehalfService,
    private readonly permissionService: PermissionService,
    private readonly attendanceService: AttendanceService,
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  /**
   * Submits a site assignment for the actor or an on-behalf employee.
   */
  async submitRequest(
    dto: SubmitSiteAssignmentDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );

    const startDate = parseUtcDateOnly(dto.startDate);
    const endDate = parseUtcDateOnly(dto.endDate);
    try {
      validateSiteAssignmentDates(startDate, endDate);
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid dates',
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

    await this.assertNoOverlap(employeeId, companyId, startDate, endDate);

    const days = calendarDaysInclusive(startDate, endDate);
    const resolvedTiers =
      await this.hrApprovalChain.buildSiteAssignmentApprovalChain(
        employeeId,
        companyId,
      );

    const title = `Site assignment — ${dto.siteName.trim()} (${formatDateOnly(startDate)} to ${formatDateOnly(endDate)})`;
    const now = new Date();
    const recordId = randomUUID();

    if (resolvedTiers.length === 0) {
      const requestNumber = await this.nextStandaloneNumber(companyId);
      await this.prisma.siteAssignment.create({
        data: {
          id: recordId,
          companyId,
          requestNumber,
          employeeId,
          siteName: dto.siteName.trim(),
          projectId: dto.projectId ?? null,
          startDate,
          endDate,
          reason: dto.reason?.trim() || null,
          status: SiteAssignmentStatus.APPROVED,
          submittedAt: now,
          completedAt: now,
          createdFromAttendanceImport:
            dto.createdFromAttendanceImport === true,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      await this.onBehalfService.recordOnBehalfCreate({
        moduleCode: 'SITE_ASSIGNMENT',
        companyId,
        actorUserId: userId,
        employeeId,
        recordId,
        recordReference: requestNumber,
        autoApproveTier: dto.autoApproveTier,
      });

      await this.recalculateForRange(
        companyId,
        employeeId,
        startDate,
        endDate,
      );

      return this.getDetail(recordId, companyId, userId);
    }

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'SITE_ASSIGNMENT',
        title,
        formData: {
          siteName: dto.siteName.trim(),
          projectId: dto.projectId ?? null,
          startDate: dto.startDate,
          endDate: dto.endDate,
          calendarDays: days,
          reason: dto.reason ?? null,
        },
      },
      companyId,
      employeeId,
      {
        resolvedTiers: {
          ruleName: 'Site assignment — Discipline Lead only',
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
      },
    )) as { id: string; requestNumber: string };

    try {
      await this.prisma.siteAssignment.create({
        data: {
          id: recordId,
          companyId,
          requestNumber: approval.requestNumber,
          employeeId,
          siteName: dto.siteName.trim(),
          projectId: dto.projectId ?? null,
          startDate,
          endDate,
          reason: dto.reason?.trim() || null,
          status: SiteAssignmentStatus.SUBMITTED,
          approvalRequestId: approval.id,
          submittedAt: now,
          createdFromAttendanceImport:
            dto.createdFromAttendanceImport === true,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Site assignment create failed after approval ${approval.id}`,
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

    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'SITE_ASSIGNMENT',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId,
      recordReference: approval.requestNumber,
      autoApproveTier: dto.autoApproveTier,
    });
    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'SITE_ASSIGNMENT',
      companyId,
      actorUserId: userId,
      employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: dto.autoApproveTier === true,
    });

    return this.getDetail(recordId, companyId, userId);
  }

  /**
   * Lists site assignments (HR: all; employee: own only).
   */
  async listRequests(
    query: ListSiteAssignmentsDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const isHr = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);

    const where: Prisma.SiteAssignmentWhereInput = activeOnly({ companyId });

    if (!isHr) {
      where.employeeId = userId;
    } else if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.siteName?.trim()) {
      where.siteName = {
        contains: query.siteName.trim(),
        mode: 'insensitive',
      };
    }

    if (query.month != null && query.year != null) {
      const monthStart = new Date(Date.UTC(query.year, query.month - 1, 1));
      const monthEnd = new Date(Date.UTC(query.year, query.month, 0));
      where.startDate = { lte: monthEnd };
      where.endDate = { gte: monthStart };
    }

    const [rows, total] = await Promise.all([
      this.prisma.siteAssignment.findMany({
        where,
        skip,
        take,
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          employee: { select: USER_SELECT },
          project: {
            select: { id: true, projectCode: true, name: true },
          },
        },
      }),
      this.prisma.siteAssignment.count({ where }),
    ]);

    const data = rows.map((row) => ({
      ...row,
      calendarDays: calendarDaysInclusive(row.startDate, row.endDate),
    }));

    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * Returns one site assignment with approval timeline.
   */
  async getDetail(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const row = await this.prisma.siteAssignment.findFirst({
      where: activeOnly({ id, companyId }),
      include: DETAIL_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Site assignment not found');
    }
    await this.assertCanView(row.employeeId, companyId, userId);
    return {
      ...row,
      calendarDays: calendarDaysInclusive(row.startDate, row.endDate),
    };
  }

  /**
   * Employee cancels their own SUBMITTED request.
   */
  async cancelSubmitted(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const row = await this.prisma.siteAssignment.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!row) {
      throw new NotFoundException('Site assignment not found');
    }
    if (row.employeeId !== userId) {
      throw new ForbiddenException(
        'Only the employee can cancel a submitted site assignment',
      );
    }
    if (row.status !== SiteAssignmentStatus.SUBMITTED) {
      throw new BadRequestException(
        'Only submitted site assignments can be cancelled by the employee',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.siteAssignment.update({
        where: { id: row.id },
        data: {
          status: SiteAssignmentStatus.CANCELLED,
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

    return this.getDetail(id, companyId, userId);
  }

  /**
   * HR cancels an approved assignment (employee returned early).
   */
  async cancelApproved(
    id: string,
    companyId: string,
    userId: string,
    reason: string,
  ): Promise<unknown> {
    await this.assertHr(companyId, userId);

    const row = await this.prisma.siteAssignment.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!row) {
      throw new NotFoundException('Site assignment not found');
    }
    if (row.status !== SiteAssignmentStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved site assignments can be cancelled by HR',
      );
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new BadRequestException('Cancellation reason is required');
    }

    const now = new Date();
    const prevStart = row.startDate;
    const prevEnd = row.endDate;

    await this.prisma.siteAssignment.update({
      where: { id: row.id },
      data: {
        status: SiteAssignmentStatus.CANCELLED,
        completedAt: now,
        reason: `${row.reason ?? ''}\n[HR cancelled] ${trimmedReason}`.trim(),
        updatedBy: userId,
      },
    });

    await this.recalculateForRange(
      companyId,
      row.employeeId,
      prevStart,
      prevEnd,
    );

    return this.getDetail(id, companyId, userId);
  }

  /**
   * HR shortens an approved assignment end date.
   */
  async shortenApproved(
    id: string,
    dto: ShortenSiteAssignmentDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertHr(companyId, userId);

    const row = await this.prisma.siteAssignment.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!row) {
      throw new NotFoundException('Site assignment not found');
    }
    if (row.status !== SiteAssignmentStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved site assignments can be shortened',
      );
    }

    const newEnd = parseUtcDateOnly(dto.endDate);
    if (newEnd.getTime() > row.endDate.getTime()) {
      throw new BadRequestException(
        'New end date cannot be after the current end date',
      );
    }
    if (newEnd.getTime() < row.startDate.getTime()) {
      throw new BadRequestException(
        'New end date cannot be before the start date',
      );
    }

    const trimmedReason = dto.reason.trim();
    if (!trimmedReason) {
      throw new BadRequestException('Reason is required when shortening');
    }

    const prevEnd = row.endDate;

    await this.prisma.siteAssignment.update({
      where: { id: row.id },
      data: {
        endDate: newEnd,
        reason: `${row.reason ?? ''}\n[HR shortened end] ${trimmedReason}`.trim(),
        updatedBy: userId,
      },
    });

    const recalcEnd =
      prevEnd.getTime() > newEnd.getTime() ? prevEnd : newEnd;
    await this.recalculateForRange(
      companyId,
      row.employeeId,
      row.startDate,
      recalcEnd,
    );

    return this.getDetail(id, companyId, userId);
  }

  /**
   * Assignments for an employee profile section.
   */
  async listForEmployee(
    employeeId: string,
    companyId: string,
    viewerId: string,
  ): Promise<unknown> {
    await this.assertCanView(employeeId, companyId, viewerId);
    const rows = await this.prisma.siteAssignment.findMany({
      where: activeOnly({ companyId, employeeId }),
      orderBy: [{ startDate: 'desc' }],
      take: 20,
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
      },
    });
    return rows.map((row) => ({
      ...row,
      calendarDays: calendarDaysInclusive(row.startDate, row.endDate),
    }));
  }

  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const row = await this.prisma.siteAssignment.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!row) {
      return;
    }

    if (
      row.status === SiteAssignmentStatus.APPROVED ||
      row.status === SiteAssignmentStatus.REJECTED ||
      row.status === SiteAssignmentStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    let nextStatus: SiteAssignmentStatus;
    if (decision === 'APPROVED') {
      nextStatus = SiteAssignmentStatus.APPROVED;
    } else if (decision === 'REJECTED') {
      nextStatus = SiteAssignmentStatus.REJECTED;
    } else {
      nextStatus = SiteAssignmentStatus.RETURNED;
    }

    await this.prisma.siteAssignment.update({
      where: { id: row.id },
      data: {
        status: nextStatus,
        completedAt: decision === 'RETURNED' ? null : now,
        updatedBy: row.employeeId,
      },
    });

    if (decision === 'APPROVED' || decision === 'REJECTED') {
      await this.recalculateForRange(
        row.companyId,
        row.employeeId,
        row.startDate,
        row.endDate,
      );
    }
  }

  private async assertNoOverlap(
    employeeId: string,
    companyId: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.siteAssignment.findMany({
      where: {
        ...activeOnly({ companyId, employeeId }),
        status: { in: TERMINAL_OVERLAP_STATUSES },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: {
        requestNumber: true,
        startDate: true,
        endDate: true,
      },
    });

    for (const row of existing) {
      if (
        rangesOverlap(
          { startDate, endDate },
          { startDate: row.startDate, endDate: row.endDate },
        )
      ) {
        throw new BadRequestException(
          `Dates overlap with site assignment ${row.requestNumber} (${formatDateOnly(row.startDate)} to ${formatDateOnly(row.endDate)})`,
        );
      }
    }
  }

  private async recalculateForRange(
    companyId: string,
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    const months = monthsTouchedByRange(startDate, endDate);
    for (const { month, year } of months) {
      await this.attendanceService.recalculateCompanyAttendanceMonth(
        companyId,
        month,
        year,
        employeeId,
      );
    }
  }

  private async nextStandaloneNumber(companyId: string): Promise<string> {
    const count = await this.prisma.siteAssignment.count({
      where: { companyId },
    });
    return `SA-${String(count + 1).padStart(4, '0')}`;
  }

  private async assertHr(companyId: string, userId: string): Promise<void> {
    const ok = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
    if (!ok) {
      throw new ForbiddenException('HR access required');
    }
  }

  private async assertCanView(
    employeeId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    if (employeeId === userId) {
      return;
    }
    const isHr = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
    if (!isHr) {
      throw new ForbiddenException('You do not have access to this record');
    }
  }
}
