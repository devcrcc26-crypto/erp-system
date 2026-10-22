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
  RequestInitiatorType,
  SiteAssignmentStatus,
} from '@prisma/client';
import type { ResolvedApprovalTier } from '../../../approvals/application/services/approval-resolver.service';
import { randomUUID } from 'crypto';
import { getRequestContext } from '../../../../shared/context/request-context';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  buildPaginatedResult,
  buildPrismaPagination,
} from '../../../../shared/utils/pagination.util';
import { AttendanceService } from '../../../attendance/application/services/attendance.service';
import { AuditService } from '../../../audit/application/services/audit.service';
import {
  type AffectedOvertimeCounts,
  dayAfter,
  OvertimeSiteSyncService,
} from '../../../overtime/application/services/overtime-site-sync.service';
import { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import type {
  ApprovalDecisionListener,
  ApprovalFinalDecision,
} from '../../../approvals/application/ports/approval-decision.listener';
import { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import { BackdatingPolicyService } from '../../../hr-shared/application/services/backdating-policy.service';
import { DayCoverageService } from '../../../hr-shared/application/services/day-coverage.service';
import { eachDay } from '../../../hr-shared/application/utils/day-coverage.util';
import { markPayrollAttendanceSnapshotStale } from '../../../attendance/application/utils/attendance-recalc-policy.util';
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
  validateSiteAssignmentDateOrder,
} from '../utils/site-assignment.util';

const USER_SELECT = {
  id: true,
  firstName: true,
  middleName: true,
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
      _count: { select: { disbursements: true } },
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

/** One validated subject of a site-assignment submission (nothing written yet). */
interface SubmissionPlan {
  employeeId: string;
  initiatedAs: RequestInitiatorType;
  startDate: Date;
  endDate: Date;
  backdating: { isLateSubmission: boolean; lateReason: string | null };
  resolvedTiers: ResolvedApprovalTier[];
}

const TERMINAL_OVERLAP_STATUSES: SiteAssignmentStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'RETURNED',
];

/**
 * Site assignment requests - remote project work without HQ scanner coverage.
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
    private readonly dayCoverage: DayCoverageService,
    private readonly backdatingPolicy: BackdatingPolicyService,
    private readonly audit: AuditService,
    private readonly overtimeSiteSync: OvertimeSiteSyncService,
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  /**
   * Submits a site assignment. With `crewEmployeeIds`, one assignment (and
   * approval request) per crew member, all validated before any is created.
   * Who may file for whom follows allowedInitiators.SITE_ASSIGNMENT.
   */
  async submitRequest(
    dto: SubmitSiteAssignmentDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    if (dto.autoApproveTier === true) {
      throw new BadRequestException(
        'Auto-approve is not available for site assignments; every tier is decided by its approver.',
      );
    }

    if (dto.crewEmployeeIds && dto.crewEmployeeIds.length > 0) {
      return this.submitCrew(dto, dto.crewEmployeeIds, companyId, userId);
    }

    const plan = await this.planSubmission(
      dto,
      dto.onBehalfOfEmployeeId,
      companyId,
      userId,
    );
    const recordId = await this.createFromPlan(plan, dto, companyId, userId, null);
    return this.getDetail(recordId, companyId, userId);
  }

  /**
   * Crew: every member must be a direct report of the submitter or inside the
   * submitter's delegate scope (never the submitter). All-or-nothing: every
   * member is validated first; if a create fails midway, the ones already
   * created are cancelled.
   */
  private async submitCrew(
    dto: SubmitSiteAssignmentDto,
    crewEmployeeIds: string[],
    companyId: string,
    userId: string,
  ): Promise<{ crewId: string; assignments: unknown[] }> {
    const memberIds = [...new Set(crewEmployeeIds)];
    if (memberIds.length !== crewEmployeeIds.length) {
      throw new BadRequestException('A crew member is listed more than once');
    }
    if (memberIds.includes(userId)) {
      throw new BadRequestException(
        'A crew request is filed for your direct reports or delegated employees, not for yourself',
      );
    }
    if (dto.onBehalfOfEmployeeId) {
      throw new BadRequestException(
        'Use either crewEmployeeIds or onBehalfOfEmployeeId, not both',
      );
    }

    const plans: SubmissionPlan[] = [];
    const errors: string[] = [];
    for (const memberId of memberIds) {
      try {
        plans.push(await this.planSubmission(dto, memberId, companyId, userId));
      } catch (error: unknown) {
        errors.push(
          `${await this.employeeLabel(memberId, companyId)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (errors.length > 0) {
      throw new BadRequestException({
        message: `No site assignments were created. ${errors.join(' · ')}`,
        details: { errors },
      });
    }

    const crewId = randomUUID();
    const created: string[] = [];
    try {
      for (const plan of plans) {
        created.push(await this.createFromPlan(plan, dto, companyId, userId, crewId));
      }
    } catch (error: unknown) {
      await this.cancelCreatedCrew(created, companyId, userId);
      throw error;
    }

    const assignments: unknown[] = [];
    for (const id of created) {
      assignments.push(await this.getDetail(id, companyId, userId));
    }
    return { crewId, assignments };
  }

  /** Validates one subject and resolves their approval chain; writes nothing. */
  private async planSubmission(
    dto: SubmitSiteAssignmentDto,
    targetEmployeeId: string | null | undefined,
    companyId: string,
    userId: string,
  ): Promise<SubmissionPlan> {
    const { employeeId, initiatedAs } = await this.onBehalfService.resolveInitiation(
      userId,
      companyId,
      'SITE_ASSIGNMENT',
      targetEmployeeId,
      { hrProcess: true },
    );

    const startDate = parseUtcDateOnly(dto.startDate);
    const endDate = parseUtcDateOnly(dto.endDate);
    try {
      validateSiteAssignmentDateOrder(startDate, endDate);
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid dates',
      );
    }

    const lateReasonText =
      dto.lateReason?.trim() || dto.reason?.trim() || undefined;
    const backdating = await this.backdatingPolicy.validateSubmissionDates({
      companyId,
      actorUserId: userId,
      targetEmployeeId: employeeId,
      dates: eachDay(startDate, endDate).map((day) => day.date),
      lateReason: lateReasonText,
    });

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
    // Not over days already covered by leave, work from home or a field
    // movement (approved or requested). HQ scans on site days stay allowed.
    await this.dayCoverage.assertUncovered(
      companyId,
      employeeId,
      eachDay(startDate, endDate),
      ['LEAVE', 'WORK_FROM_HOME', 'FIELD_MOVEMENT'],
    );

    let resolvedTiers =
      await this.hrApprovalChain.buildSiteAssignmentApprovalChain(
        employeeId,
        companyId,
      );
    // Supervisor and HR/delegate filings: the submitter must never approve
    // their own request (e.g. HR Manager filing for someone with no Reports to,
    // where the fallback tier would otherwise be themselves).
    if (
      initiatedAs === RequestInitiatorType.SUPERVISOR ||
      initiatedAs === RequestInitiatorType.DELEGATE
    ) {
      resolvedTiers = await this.hrApprovalChain.startChainAboveSubmitter(
        resolvedTiers,
        userId,
        companyId,
      );
    }

    // Site assignments unlock scheduled hours as OT, so they are never
    // auto-approved; the chain always has at least an HR tier.
    if (resolvedTiers.length === 0) {
      throw new BadRequestException(
        'No approver is available for this site assignment - ask HR to assign an HR Manager.',
      );
    }

    return { employeeId, initiatedAs, startDate, endDate, backdating, resolvedTiers };
  }

  /** Opens the approval request and creates the assignment; returns its id. */
  private async createFromPlan(
    plan: SubmissionPlan,
    dto: SubmitSiteAssignmentDto,
    companyId: string,
    userId: string,
    crewId: string | null,
  ): Promise<string> {
    const { employeeId, initiatedAs, startDate, endDate, backdating, resolvedTiers } = plan;
    const title = `Site assignment - ${dto.siteName.trim()} (${formatDateOnly(startDate)} to ${formatDateOnly(endDate)})`;
    const now = new Date();
    const recordId = randomUUID();

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'SITE_ASSIGNMENT',
        title,
        formData: {
          siteName: dto.siteName.trim(),
          projectId: dto.projectId ?? null,
          startDate: dto.startDate,
          endDate: dto.endDate,
          calendarDays: calendarDaysInclusive(startDate, endDate),
          reason: dto.reason ?? null,
          ...(crewId ? { crewId } : {}),
        },
      },
      companyId,
      employeeId,
      {
        resolvedTiers: {
          ruleName:
            initiatedAs === RequestInitiatorType.SUPERVISOR
              ? 'Site assignment - above the submitting supervisor'
              : 'Site assignment - Reports to',
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
        initiatedAs,
        lateSubmission: {
          isLateSubmission: backdating.isLateSubmission,
          lateReason: backdating.lateReason,
        },
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
          isLateSubmission: backdating.isLateSubmission,
          lateReason: backdating.lateReason,
          status: SiteAssignmentStatus.SUBMITTED,
          approvalRequestId: approval.id,
          submittedAt: now,
          createdFromAttendanceImport:
            dto.createdFromAttendanceImport === true,
          crewId,
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
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      // Never surface raw Prisma / driver errors — the UI maps those to
      // "Something went wrong" and the approval row is already cancelled.
      throw new BadRequestException(
        'Could not save this site assignment after opening the approval. Try again, or pick different dates if one already covers this period.',
      );
    }

    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'SITE_ASSIGNMENT',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId,
      recordReference: approval.requestNumber,
      autoApproveTier: false,
    });
    await this.writeAudit(companyId, userId, 'create', recordId, approval.requestNumber, null, {
      employeeId,
      initiatedBy: userId,
      initiatedAs,
      crewId,
      siteName: dto.siteName.trim(),
      projectId: dto.projectId ?? null,
      startDate: formatDateOnly(startDate),
      endDate: formatDateOnly(endDate),
      status: SiteAssignmentStatus.SUBMITTED,
      approvalRequestId: approval.id,
      approvers: resolvedTiers.map((tier) => tier.label),
    });
    // No delegate auto-approve: rejected above and blocked in OnBehalfService.
    return recordId;
  }

  /** Rolls back a partly created crew (assignments and approvals cancelled). */
  private async cancelCreatedCrew(
    ids: string[],
    companyId: string,
    userId: string,
  ): Promise<void> {
    const now = new Date();
    for (const id of ids) {
      const row = await this.prisma.siteAssignment.update({
        where: { id },
        data: {
          status: SiteAssignmentStatus.CANCELLED,
          completedAt: now,
          reason: '[Crew submission rolled back]',
          updatedBy: userId,
        },
      });
      if (row.approvalRequestId) {
        await this.prisma.approvalRequest.update({
          where: { id: row.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
      await this.writeAudit(companyId, userId, 'cancel', row.id, row.requestNumber, {
        status: SiteAssignmentStatus.SUBMITTED,
      }, { status: SiteAssignmentStatus.CANCELLED, by: 'CREW_ROLLBACK' });
    }
  }

  private async employeeLabel(employeeId: string, companyId: string): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: { id: employeeId, companyId },
      select: { firstName: true, lastName: true, employeeId: true },
    });
    if (!user) {
      return employeeId;
    }
    return [user.firstName, user.lastName, user.employeeId ? `(${user.employeeId})` : null]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Lists site assignments (HR: all; employee: own only).
   */
  async listRequests(
    query: ListSiteAssignmentsDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const canManageAll = await this.permissionService.hasPermission(
      userId,
      companyId,
      'site-assignment',
      'manage',
    );

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);

    const where: Prisma.SiteAssignmentWhereInput = activeOnly({ companyId });

    if (!canManageAll) {
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
    await this.writeAudit(
      companyId,
      userId,
      'cancel',
      row.id,
      row.requestNumber,
      { status: row.status },
      { status: SiteAssignmentStatus.CANCELLED, by: 'EMPLOYEE' },
    );

    return this.getDetail(id, companyId, userId);
  }

  /**
   * Overtime entries a cancel (no endDate) or shorten (new endDate) would affect,
   * for the HR confirmation screen.
   */
  async getOvertimeImpact(
    id: string,
    companyId: string,
    userId: string,
    endDate?: string,
  ): Promise<AffectedOvertimeCounts> {
    await this.assertHr(companyId, userId);
    const row = await this.prisma.siteAssignment.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!row) {
      throw new NotFoundException('Site assignment not found');
    }
    const removedFrom = endDate
      ? dayAfter(parseUtcDateOnly(endDate))
      : row.startDate;
    return this.overtimeSiteSync.countAffected(row, removedFrom);
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
    const overtime = await this.overtimeSiteSync.syncAfterRemoval(
      row,
      row.startDate,
      'ASSIGNMENT_CANCELLED',
    );
    await this.writeAudit(
      companyId,
      userId,
      'cancel',
      row.id,
      row.requestNumber,
      { status: row.status },
      {
        status: SiteAssignmentStatus.CANCELLED,
        by: 'HR',
        reason: trimmedReason,
        overtimeReclassified: overtime.unsubmitted,
        overtimeFlagged: overtime.submitted,
      },
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
    const overtime = await this.overtimeSiteSync.syncAfterRemoval(
      { ...row, endDate: newEnd },
      dayAfter(newEnd),
      'ASSIGNMENT_SHORTENED',
    );
    await this.writeAudit(
      companyId,
      userId,
      'shorten',
      row.id,
      row.requestNumber,
      { endDate: formatDateOnly(prevEnd) },
      {
        endDate: formatDateOnly(newEnd),
        reason: trimmedReason,
        overtimeReclassified: overtime.unsubmitted,
        overtimeFlagged: overtime.submitted,
      },
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

    if (decision === 'APPROVED') {
      await this.overtimeSiteSync.syncAfterApproval(row);
      if (row.isLateSubmission) {
        for (const period of monthsTouchedByRange(row.startDate, row.endDate)) {
          await markPayrollAttendanceSnapshotStale(
            this.prisma,
            row.companyId,
            period.month,
            period.year,
          );
        }
      }
    }

    await this.writeAudit(
      row.companyId,
      getRequestContext()?.userId,
      decision === 'APPROVED' ? 'approve' : decision === 'REJECTED' ? 'reject' : 'return',
      row.id,
      row.requestNumber,
      { status: row.status },
      { status: nextStatus, approvalRequestId },
    );
  }

  private async writeAudit(
    companyId: string,
    userId: string | undefined,
    action: 'create' | 'approve' | 'reject' | 'return' | 'cancel' | 'shorten',
    recordId: string,
    recordReference: string,
    beforeValue: Record<string, unknown> | null,
    afterValue: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId,
        companyId,
        module: 'site_assignment',
        action,
        recordType: 'site_assignment',
        recordId,
        recordReference,
        beforeValue: (beforeValue ?? undefined) as Prisma.InputJsonValue | undefined,
        afterValue: afterValue as Prisma.InputJsonValue,
      }),
    );
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

  private async assertHr(companyId: string, userId: string): Promise<void> {
    const ok = await this.permissionService.hasPermission(
      userId,
      companyId,
      'site-assignment',
      'manage',
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
    const canViewOthers = await this.permissionService.hasPermission(
      userId,
      companyId,
      'site-assignment',
      'view',
    );
    if (!canViewOthers) {
      throw new ForbiddenException('You do not have access to this record');
    }
  }
}
