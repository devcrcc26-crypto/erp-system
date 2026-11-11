import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ApprovalRequestStatus, Prisma, SiteAssignmentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { getRequestContext } from '../../../../shared/context/request-context';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  isEmployeeInTeamScope,
  resolveTeamScopedEmployeeIds,
  teamScopeWhere,
} from '../../../../shared/org/team-scope.util';
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
import type {
  ApprovalDecisionListener,
  ApprovalFinalDecision,
} from '../../../approvals/application/ports/approval-decision.listener';
import { BackdatingPolicyService } from '../../../hr-shared/application/services/backdating-policy.service';
import type { BackdatingActorKind } from '../../../hr-shared/application/utils/earliest-allowed-date.util';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { hrProcessEmployeeWhere } from '../../../../shared/prisma/hr-process.util';
import { DayCoverageService } from '../../../hr-shared/application/services/day-coverage.service';
import { eachDay } from '../../../hr-shared/application/utils/day-coverage.util';
import { markPayrollAttendanceSnapshotStale } from '../../../attendance/application/utils/attendance-recalc-policy.util';
import { formatDateOnly } from '../../../work-schedule/application/services/work-schedule.dates';
import {
  CreateSiteAssignmentDto,
  ListHrEmployeesForSiteAssignmentDto,
  ListSiteAssignmentsDto,
  ShortenSiteAssignmentDto,
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

const SITE_ASSIGNMENT_ACTIVE_EVENT = 'SITE_ASSIGNMENT_ACTIVE';

interface SubmitAuthorization {
  actorUserId: string;
  attributedSupervisorId: string;
  isHrSubmitter: boolean;
}

/** Validated create payload (nothing persisted yet). */
interface SubmissionPlan {
  employeeId: string;
  startDate: Date;
  endDate: Date;
  backdating: { isLateSubmission: boolean; lateReason: string | null };
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
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
    private readonly notificationService: NotificationService,
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
   * Creates a site assignment for an employee. Authorized supervisors and HR
   * only; the record is immediately APPROVED (no approval workflow).
   */
  async submitRequest(
    dto: CreateSiteAssignmentDto,
    companyId: string,
    actorUserId: string,
  ): Promise<unknown> {
    const auth = await this.resolveSubmitAuthorization(dto, companyId, actorUserId);
    const plan = await this.buildSubmissionPlan(dto, auth, companyId);
    const recordId = await this.createApprovedAssignment(
      plan,
      dto,
      companyId,
      auth,
    );
    return this.getDetail(recordId, companyId, actorUserId);
  }

  /**
   * Pickers for the site assignment form: direct reports or supervisor list.
   */
  async listEmployeesForSiteAssignment(
    companyId: string,
    query: ListHrEmployeesForSiteAssignmentDto,
  ): Promise<unknown[]> {
    const supervisorsOnly =
      query.siteAssignmentSupervisors === 'true' ||
      query.siteAssignmentSupervisors === '1';

    const base: Prisma.UserWhereInput = activeOnly({
      companyId,
      isActive: true,
    });

    if (supervisorsOnly) {
      const rows = await this.prisma.user.findMany({
        where: {
          AND: [
            base,
            {
              OR: [
                { excludedFromHrProcesses: true },
                {
                  directReports: {
                    some: activeOnly({ companyId, isActive: true }),
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          employeeId: true,
          department: { select: { name: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });
      return rows;
    }

    if (!query.reportsTo) {
      throw new BadRequestException('reportsTo is required');
    }

    const rows = await this.prisma.user.findMany({
      where: {
        AND: [
          base,
          hrProcessEmployeeWhere({}),
          { reportsToUserId: query.reportsTo },
        ],
      },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employeeId: true,
        department: { select: { name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return rows;
  }

  private async resolveSubmitAuthorization(
    dto: CreateSiteAssignmentDto,
    companyId: string,
    actorUserId: string,
  ): Promise<SubmitAuthorization> {
    const employeeId = dto.employeeId;
    if (employeeId === actorUserId) {
      throw new ForbiddenException(
        'You cannot submit a site assignment for yourself',
      );
    }

    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId, isActive: true }),
      select: { id: true, reportsToUserId: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const isHrSubmitter = await this.isHrSiteAssignmentSubmitter(
      actorUserId,
      companyId,
    );

    if (isHrSubmitter) {
      const supervisorId =
        dto.onBehalfOfSupervisorId?.trim() || employee.reportsToUserId || null;
      if (!supervisorId) {
        throw new ForbiddenException(
          'Select the supervisor this assignment is submitted on behalf of',
        );
      }
      if (employee.reportsToUserId !== supervisorId) {
        throw new ForbiddenException(
          'The employee must directly report to the selected supervisor',
        );
      }
      const supervisor = await this.prisma.user.findFirst({
        where: activeOnly({ id: supervisorId, companyId, isActive: true }),
        select: { id: true },
      });
      if (!supervisor) {
        throw new NotFoundException('Supervisor not found');
      }
      return {
        actorUserId,
        attributedSupervisorId: supervisorId,
        isHrSubmitter: true,
      };
    }

    if (dto.onBehalfOfSupervisorId) {
      throw new ForbiddenException(
        'Only HR may submit on behalf of a supervisor',
      );
    }
    if (employee.reportsToUserId !== actorUserId) {
      throw new ForbiddenException(
        'You may only submit site assignments for your direct reports',
      );
    }

    return {
      actorUserId,
      attributedSupervisorId: actorUserId,
      isHrSubmitter: false,
    };
  }

  private async isHrSiteAssignmentSubmitter(
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    if (
      await this.permissionService.hasPermission(
        userId,
        companyId,
        'site-assignment',
        'manage',
      )
    ) {
      return true;
    }
    return this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
  }

  private async buildSubmissionPlan(
    dto: CreateSiteAssignmentDto,
    auth: SubmitAuthorization,
    companyId: string,
  ): Promise<SubmissionPlan> {
    const employeeId = dto.employeeId;
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
    const actorKind: BackdatingActorKind = auth.isHrSubmitter
      ? 'HR_ON_BEHALF'
      : 'EMPLOYEE_SELF';
    const backdating = await this.backdatingPolicy.validateSubmissionDates({
      companyId,
      actorUserId: auth.actorUserId,
      targetEmployeeId: employeeId,
      dates: eachDay(startDate, endDate).map((day) => day.date),
      lateReason: lateReasonText,
      actorKind,
    });

    await this.assertNoOverlap(employeeId, companyId, startDate, endDate);
    await this.dayCoverage.assertUncovered(
      companyId,
      employeeId,
      eachDay(startDate, endDate),
      ['LEAVE', 'WORK_FROM_HOME', 'FIELD_MOVEMENT'],
    );

    return { employeeId, startDate, endDate, backdating };
  }

  private async createApprovedAssignment(
    plan: SubmissionPlan,
    dto: CreateSiteAssignmentDto,
    companyId: string,
    auth: SubmitAuthorization,
  ): Promise<string> {
    const { employeeId, startDate, endDate, backdating } = plan;
    const now = new Date();
    const recordId = randomUUID();
    const requestNumber = await this.nextSiteAssignmentNumber();

    const row = await this.prisma.siteAssignment.create({
      data: {
        id: recordId,
        companyId,
        requestNumber,
        employeeId,
        siteName: dto.siteName.trim(),
        projectName: dto.projectName?.trim() || null,
        projectId: null,
        startDate,
        endDate,
        reason: dto.reason?.trim() || null,
        isLateSubmission: backdating.isLateSubmission,
        lateReason: backdating.lateReason,
        status: SiteAssignmentStatus.APPROVED,
        approvalRequestId: null,
        submittedAt: now,
        completedAt: now,
        createdFromAttendanceImport: dto.createdFromAttendanceImport === true,
        crewId: null,
        createdBy: auth.attributedSupervisorId,
        updatedBy: auth.actorUserId,
      },
    });

    await this.applyApprovedSideEffects(row);

    const supervisorName = await this.formatUserDisplayName(
      auth.attributedSupervisorId,
      companyId,
    );
    const startLabel = formatDateOnly(startDate);
    const endLabel = formatDateOnly(endDate);
    await this.notificationService.send(
      { companyId, userId: auth.actorUserId },
      {
        recipientId: employeeId,
        eventType: SITE_ASSIGNMENT_ACTIVE_EVENT,
        subject: 'Site assignment active',
        body: `A site assignment has been submitted for you by ${supervisorName} and is now active from ${startLabel} to ${endLabel}`,
        link: `/hr/site-assignments/${recordId}`,
      },
    );

    await this.writeAudit(
      companyId,
      auth.actorUserId,
      'approve',
      recordId,
      requestNumber,
      null,
      {
        employeeId,
        attributedSupervisorId: auth.attributedSupervisorId,
        siteName: dto.siteName.trim(),
        projectName: dto.projectName?.trim() || null,
        startDate: startLabel,
        endDate: endLabel,
        status: SiteAssignmentStatus.APPROVED,
        autoApproved: true,
      },
    );

    return recordId;
  }

  private async applyApprovedSideEffects(row: {
    id: string;
    companyId: string;
    employeeId: string;
    startDate: Date;
    endDate: Date;
    isLateSubmission: boolean;
  }): Promise<void> {
    await this.recalculateForRange(
      row.companyId,
      row.employeeId,
      row.startDate,
      row.endDate,
    );
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

  private async nextSiteAssignmentNumber(): Promise<string> {
    const category = await this.prisma.approvalCategory.findFirst({
      where: { code: 'SITE_ASSIGNMENT', deletedAt: null },
      select: { numberPrefix: true },
    });
    const prefix = category?.numberPrefix ?? 'SA';
    const result = await this.prisma.$queryRawUnsafe<
      Array<{ nextval: bigint | number }>
    >(`SELECT nextval('approval_request_number_seq') as nextval`);
    const next = Number(result[0]?.nextval ?? 1);
    return `${prefix}-${String(next).padStart(4, '0')}`;
  }

  private async formatUserDisplayName(
    userId: string,
    companyId: string,
  ): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId }),
      select: { firstName: true, middleName: true, lastName: true },
    });
    if (!user) {
      return 'Your supervisor';
    }
    return [user.firstName, user.middleName, user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
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
      // Own assignments, plus the team's for supervisors (anyone with reports).
      where.AND = [
        teamScopeWhere(
          userId,
          await resolveTeamScopedEmployeeIds(this.prisma, userId, companyId),
          query.employeeId,
          ['CANCELLED'],
        ),
      ];
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
    // HR, or a supervisor for their team. Plain site-assignment.view (held by
    // every employee) is not enough to open someone else's record.
    const canViewOthers =
      (await this.isHrSiteAssignmentSubmitter(userId, companyId)) ||
      (await isEmployeeInTeamScope(this.prisma, userId, companyId, employeeId));
    if (!canViewOthers) {
      throw new ForbiddenException('You do not have access to this record');
    }
  }
}
