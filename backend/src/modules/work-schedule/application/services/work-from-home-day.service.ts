import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ApprovalRequestStatus,
  Prisma,
  WorkFromHomeScope,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  EXCLUDED_FROM_HR_MESSAGE,
  hrProcessEmployeeWhere,
} from '../../../../shared/prisma/hr-process.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { AttendanceService } from '../../../attendance/application/services/attendance.service';
import type {
  ApprovalDecisionListener,
  ApprovalFinalDecision,
} from '../../../approvals/application/ports/approval-decision.listener';
import { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import { BackdatingPolicyService } from '../../../hr-shared/application/services/backdating-policy.service';
import { DayCoverageService } from '../../../hr-shared/application/services/day-coverage.service';
import type {
  CancelWorkFromHomeRequestDto,
  CreateWorkFromHomeDayDto,
  PreviewWorkFromHomeRangeDto,
  RequestWorkFromHomeDayDto,
  UpdateWorkFromHomeDayDto,
} from '../dtos/work-from-home-day.dto';
import { iterateUtcDays, parseDateOnly } from './work-schedule.dates';
import { WFH_MAX_RANGE_DAYS } from './work-from-home-range.util';
import {
  formatWorkFromHomeRangeLabel,
  monthsOfDateKeys,
  planWorkFromHomeRange,
  workFromHomeFormDates,
  type WorkFromHomeRangePlan,
} from './work-from-home-range.util';
import { WorkScheduleService } from './work-schedule.service';

/** Approval form of a work-from-home request (one request per range). */
interface WorkFromHomeFormData {
  startDate?: string;
  endDate?: string;
  /** Days to create on approval (non-skipped days of the range). */
  dates?: string[];
  skipped?: Array<{ date: string; reason: string }>;
  /** Legacy single-day requests. */
  date?: string;
  reason?: string;
  employeeId?: string;
  createdFromAttendanceImport?: boolean;
  /** Days this request actually added on approval (removed again on cancel). */
  appliedDates?: string[];
  notAppliedDates?: string[];
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string | null;
}

type ApplyDayResult = 'applied' | 'covered' | 'conflict';

const OPEN_WFH_STATUSES: ApprovalRequestStatus[] = [
  ApprovalRequestStatus.PENDING,
  ApprovalRequestStatus.SUBMITTED,
  ApprovalRequestStatus.IN_REVIEW,
  ApprovalRequestStatus.RETURNED,
];

interface AssignerContext {
  userId: string;
  isHr: boolean;
  ledDisciplineIds: string[];
}

interface AssignableEmployee {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  chineseName: string | null;
  employeeId: string | null;
  department: string | null;
  discipline: string | null;
}

interface WfhEmployeeSummary {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  chineseName: string | null;
  employeeId: string | null;
}

const WFH_USER_NAME_SELECT = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  chineseName: true,
  employeeId: true,
} as const;

/**
 * Work-from-home calendar days (attendance credit).
 * - Employees request a date range → Discipline Lead approval. One approval
 *   request per range; approval creates the per-day rows for its working days.
 * - Discipline Leads assign employees under their disciplines (multi-select).
 * - HR assigns anyone / departments / company-wide.
 */
@Injectable()
export class WorkFromHomeDayService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WorkFromHomeDayService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AttendanceService))
    private readonly attendanceService: AttendanceService,
    private readonly permissionService: PermissionService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly approvalsService: ApprovalsService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly onBehalfService: OnBehalfService,
    private readonly dayCoverage: DayCoverageService,
    private readonly backdatingPolicy: BackdatingPolicyService,
    @Inject(forwardRef(() => WorkScheduleService))
    private readonly workScheduleService: WorkScheduleService,
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  /**
   * Lists WFH calendar days for a company (optional month filter).
   */
  async list(
    companyId: string,
    month?: number,
    year?: number,
  ): Promise<unknown[]> {
    const where: Prisma.WorkFromHomeDayWhereInput = activeOnly({ companyId });
    if (month != null && year != null) {
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0));
      where.date = { gte: start, lte: end };
    }
    const rows = await this.prisma.workFromHomeDay.findMany({
      where,
      orderBy: { date: 'asc' },
    });
    const employeeIds = [
      ...new Set(rows.flatMap((row) => row.employeeIds)),
    ];
    const employeesById = await this.loadEmployeeSummaries(
      companyId,
      employeeIds,
    );
    return rows.map((row) =>
      this.mapRow(
        row,
        row.employeeIds
          .map((id) => employeesById.get(id))
          .filter((user): user is WfhEmployeeSummary => Boolean(user)),
      ),
    );
  }

  private async loadEmployeeSummaries(
    companyId: string,
    employeeIds: string[],
  ): Promise<Map<string, WfhEmployeeSummary>> {
    const map = new Map<string, WfhEmployeeSummary>();
    if (employeeIds.length === 0) {
      return map;
    }
    const users = await this.prisma.user.findMany({
      where: { companyId, id: { in: employeeIds } },
      select: WFH_USER_NAME_SELECT,
    });
    for (const user of users) {
      map.set(user.id, {
        id: user.id,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        chineseName: user.chineseName,
        employeeId: user.employeeId,
      });
    }
    return map;
  }

  /**
   * List for assigners (HR or Discipline Lead). Ordinary employees use New Request.
   */
  async listForAssigner(
    companyId: string,
    userId: string,
    month?: number,
    year?: number,
  ): Promise<unknown[]> {
    const ctx = await this.resolveAssigner(userId, companyId);
    this.assertCanAssign(ctx);
    return this.list(companyId, month, year);
  }

  /**
   * Employees the actor may assign WFH to (HR: anyone; DL: their discipline).
   */
  async listAssignableEmployees(
    userId: string,
    companyId: string,
  ): Promise<{
    canAssignCompanyWide: boolean;
    isDisciplineLead: boolean;
    employees: AssignableEmployee[];
  }> {
    const ctx = await this.resolveAssigner(userId, companyId);
    if (!ctx.isHr && ctx.ledDisciplineIds.length === 0) {
      throw new ForbiddenException(
        'Only HR or a Discipline Lead can assign work-from-home days',
      );
    }

    const where: Prisma.UserWhereInput = ctx.isHr
      ? activeOnly(hrProcessEmployeeWhere({ companyId, isActive: true }))
      : activeOnly(
          hrProcessEmployeeWhere({
            companyId,
            isActive: true,
            engineeringDisciplineId: { in: ctx.ledDisciplineIds },
          }),
        );

    const users = await this.prisma.user.findMany({
      where,
      select: {
        ...WFH_USER_NAME_SELECT,
        department: { select: { name: true } },
        engineeringDiscipline: { select: { name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return {
      canAssignCompanyWide: ctx.isHr,
      isDisciplineLead: ctx.ledDisciplineIds.length > 0,
      employees: users.map((user) => ({
        id: user.id,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        chineseName: user.chineseName,
        employeeId: user.employeeId,
        department: user.department?.name ?? null,
        discipline: user.engineeringDiscipline?.name ?? null,
      })),
    };
  }

  /**
   * Direct assignment by HR (any scope) or Discipline Lead (employees under them).
   * Accepts a single `date` or an inclusive `startDate`–`endDate` range
   * (one calendar day row per date; employee-scope merges into existing days).
   */
  async create(
    dto: CreateWorkFromHomeDayDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const ctx = await this.resolveAssigner(userId, companyId);
    this.assertCanAssign(ctx);

    const startKey = dto.startDate ?? dto.date;
    const endKey = dto.endDate ?? dto.date ?? dto.startDate;
    if (!startKey || !endKey) {
      throw new BadRequestException(
        'Provide date, or startDate and endDate',
      );
    }
    const start = parseDateOnly(startKey);
    const end = parseDateOnly(endKey);
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    const dates = iterateUtcDays(start, end);
    if (dates.length > WFH_MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Work-from-home range cannot exceed ${WFH_MAX_RANGE_DAYS} days`,
      );
    }

    const scope = ctx.isHr
      ? (dto.scope ?? WorkFromHomeScope.ALL)
      : WorkFromHomeScope.EMPLOYEES;
    const departmentIds =
      scope === WorkFromHomeScope.DEPARTMENTS ? (dto.departmentIds ?? []) : [];
    let employeeIds =
      scope === WorkFromHomeScope.EMPLOYEES ? (dto.employeeIds ?? []) : [];

    if (!ctx.isHr) {
      employeeIds = await this.assertEmployeesUnderDiscipline(
        employeeIds,
        ctx.ledDisciplineIds,
        companyId,
      );
    }
    await this.assertHrProcessEmployees(employeeIds, companyId);

    this.validateScopePayload(scope, departmentIds, employeeIds);

    const created: unknown[] = [];
    for (const date of dates) {
      created.push(
        await this.createOrMergeOneDay({
          companyId,
          userId,
          date,
          reason: dto.reason.trim(),
          scope,
          departmentIds,
          employeeIds,
          ctx,
        }),
      );
    }
    return dates.length === 1 ? created[0] : { created: created.length, days: created };
  }

  private async createOrMergeOneDay(input: {
    companyId: string;
    userId: string;
    date: Date;
    reason: string;
    scope: WorkFromHomeScope;
    departmentIds: string[];
    employeeIds: string[];
    ctx: AssignerContext;
  }): Promise<unknown> {
    const existing = await this.prisma.workFromHomeDay.findFirst({
      where: activeOnly({ companyId: input.companyId, date: input.date }),
    });

    if (existing) {
      if (input.scope === WorkFromHomeScope.EMPLOYEES) {
        return this.mergeEmployeesOntoDay(
          existing,
          input.employeeIds,
          input.reason,
          input.userId,
          input.companyId,
          input.ctx,
        );
      }
      // Range assign: keep existing company/department day; do not fail the whole range.
      return this.mapRow(existing);
    }

    try {
      const created = await this.prisma.workFromHomeDay.create({
        data: {
          id: randomUUID(),
          companyId: input.companyId,
          date: input.date,
          reason: input.reason,
          scope: input.scope,
          departmentIds: input.departmentIds,
          employeeIds: input.employeeIds,
          createdBy: input.userId,
          updatedBy: input.userId,
        },
      });
      await this.recalculateMonth(input.companyId, input.date);
      return this.mapRow(created);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A work-from-home day already exists for this date',
        );
      }
      throw error;
    }
  }

  /**
   * Updates a WFH day. Discipline Leads may only manage EMPLOYEES scope for their reports.
   */
  async update(
    id: string,
    dto: UpdateWorkFromHomeDayDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const ctx = await this.resolveAssigner(userId, companyId);
    this.assertCanAssign(ctx);

    const existing = await this.findOrThrow(id, companyId);

    if (!ctx.isHr) {
      if (existing.scope !== WorkFromHomeScope.EMPLOYEES) {
        throw new ForbiddenException(
          'Discipline Leads can only edit employee-scoped work-from-home days',
        );
      }
      if (dto.scope != null && dto.scope !== WorkFromHomeScope.EMPLOYEES) {
        throw new ForbiddenException(
          'Discipline Leads can only assign specific employees',
        );
      }
      if (dto.departmentIds != null && dto.departmentIds.length > 0) {
        throw new ForbiddenException(
          'Discipline Leads cannot assign by department',
        );
      }
    }

    const nextScope = ctx.isHr
      ? (dto.scope ?? existing.scope)
      : WorkFromHomeScope.EMPLOYEES;
    let nextDepartmentIds =
      dto.departmentIds !== undefined
        ? dto.departmentIds
        : existing.departmentIds;
    let nextEmployeeIds =
      dto.employeeIds !== undefined ? dto.employeeIds : existing.employeeIds;

    if (nextScope !== WorkFromHomeScope.DEPARTMENTS) {
      nextDepartmentIds = [];
    }
    if (nextScope !== WorkFromHomeScope.EMPLOYEES) {
      nextEmployeeIds = [];
    }

    if (!ctx.isHr) {
      const allowed = new Set(
        (
          await this.listAssignableEmployees(userId, companyId)
        ).employees.map((row) => row.id),
      );
      const outside = existing.employeeIds.filter((id) => !allowed.has(id));
      const requested = dto.employeeIds ?? existing.employeeIds.filter((id) =>
        allowed.has(id),
      );
      const validated = await this.assertEmployeesUnderDiscipline(
        requested,
        ctx.ledDisciplineIds,
        companyId,
      );
      nextEmployeeIds = [...new Set([...outside, ...validated])];
    }
    await this.assertHrProcessEmployees(dto.employeeIds ?? [], companyId);

    this.validateScopePayload(nextScope, nextDepartmentIds, nextEmployeeIds);

    const updated = await this.prisma.workFromHomeDay.update({
      where: { id },
      data: {
        ...(dto.date !== undefined ? { date: parseDateOnly(dto.date) } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason.trim() } : {}),
        scope: nextScope,
        departmentIds: nextDepartmentIds,
        employeeIds: nextEmployeeIds,
        updatedBy: userId,
      },
    });
    await this.recalculateMonth(companyId, existing.date);
    if (dto.date !== undefined) {
      await this.recalculateMonth(companyId, parseDateOnly(dto.date));
    }
    return this.mapRow(updated);
  }

  /**
   * Soft-deletes a WFH day. Discipline Leads may only delete EMPLOYEES rows
   * that only cover their reports (or remove their reports and keep the rest).
   */
  async remove(id: string, companyId: string, userId: string): Promise<void> {
    const ctx = await this.resolveAssigner(userId, companyId);
    this.assertCanAssign(ctx);
    const existing = await this.findOrThrow(id, companyId);

    if (!ctx.isHr) {
      if (existing.scope !== WorkFromHomeScope.EMPLOYEES) {
        throw new ForbiddenException(
          'Discipline Leads can only change employee-scoped work-from-home days',
        );
      }
      const allowed = new Set(
        (
          await this.listAssignableEmployees(userId, companyId)
        ).employees.map((row) => row.id),
      );
      const remaining = existing.employeeIds.filter((id) => !allowed.has(id));
      if (remaining.length > 0) {
        await this.prisma.workFromHomeDay.update({
          where: { id },
          data: {
            employeeIds: remaining,
            updatedBy: userId,
          },
        });
        await this.recalculateMonth(companyId, existing.date);
        return;
      }
    }

    await this.prisma.workFromHomeDay.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });
    await this.recalculateMonth(companyId, existing.date);
  }

  /**
   * Working days a range would create for the employee, and skipped days with
   * the reason (Sunday / holiday / day off / leave / site / already WFH …).
   */
  async previewRange(
    dto: PreviewWorkFromHomeRangeDto,
    companyId: string,
    userId: string,
  ): Promise<WorkFromHomeRangePlan & { employeeId: string; label: string }> {
    const employeeId = await this.onBehalfService.resolveHrProcessSubjectId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    const plan = await this.buildRangePlan(
      companyId,
      employeeId,
      parseDateOnly(dto.startDate),
      parseDateOnly(dto.endDate),
    );
    return {
      ...plan,
      employeeId,
      label: formatWorkFromHomeRangeLabel(
        plan.startDate,
        plan.endDate,
        plan.workingDays,
      ),
    };
  }

  /**
   * Employee (or on-behalf) request for a date range — opens one
   * Employee → Discipline Lead approval carrying the list of working days.
   */
  async submitRequest(
    dto: RequestWorkFromHomeDayDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveHrProcessSubjectId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    const startKey = dto.startDate ?? dto.date;
    const endKey = dto.endDate ?? dto.date ?? dto.startDate;
    if (!startKey || !endKey) {
      throw new BadRequestException('Choose the work-from-home dates');
    }
    const start = parseDateOnly(startKey);
    const end = parseDateOnly(endKey);
    const reason = dto.reason.trim();

    const plan = await this.buildRangePlan(companyId, employeeId, start, end);
    if (plan.dates.length === 0) {
      throw new BadRequestException(
        'None of the selected days can be work from home (Sundays, holidays, leave, site assignments or existing work from home)',
      );
    }

    const backdating = await this.backdatingPolicy.validateSubmissionDates({
      companyId,
      actorUserId: userId,
      targetEmployeeId: employeeId,
      dates: plan.dates.map((key) => parseDateOnly(key)),
      lateReason: dto.lateReason,
    });

    const resolvedTiers =
      await this.hrApprovalChain.buildSiteAssignmentApprovalChain(
        employeeId,
        companyId,
      );

    const title = `Work from home — ${formatWorkFromHomeRangeLabel(
      plan.startDate,
      plan.endDate,
      plan.workingDays,
    )}`;
    const formData: WorkFromHomeFormData = {
      startDate: plan.startDate,
      endDate: plan.endDate,
      dates: plan.dates,
      skipped: plan.skipped,
      reason,
      employeeId,
      createdFromAttendanceImport: dto.createdFromAttendanceImport === true,
    };

    if (resolvedTiers.length === 0) {
      const applied = await this.applyEmployeeDays(
        companyId,
        employeeId,
        plan.dates,
        reason,
        userId,
        formData.createdFromAttendanceImport === true,
      );
      await this.onBehalfService.recordOnBehalfCreate({
        moduleCode: 'WORK_FROM_HOME',
        companyId,
        actorUserId: userId,
        employeeId,
        recordId: `${plan.startDate}:${plan.endDate}:${employeeId}`,
        recordReference: title,
      });
      return {
        autoApproved: true,
        startDate: plan.startDate,
        endDate: plan.endDate,
        dates: applied.appliedDates,
        employeeId,
      };
    }

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'WORK_FROM_HOME',
        title,
        formData: formData as Prisma.InputJsonObject,
      },
      companyId,
      employeeId,
      {
        resolvedTiers: {
          ruleName: 'Work from home — Discipline Lead only',
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
        lateSubmission: {
          isLateSubmission: backdating.isLateSubmission,
          lateReason: backdating.lateReason,
        },
      },
    )) as { id: string; requestNumber: string };

    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'WORK_FROM_HOME',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId: approval.id,
      recordReference: approval.requestNumber,
    });

    return approval;
  }

  /**
   * Cancels a work-from-home request. Pending: the employee, the person who
   * filed it, or HR — nothing was created, so nothing is removed. Approved:
   * HR only — removes the day rows this request added and recalculates.
   */
  async cancelRequest(
    approvalRequestId: string,
    dto: CancelWorkFromHomeRequestDto,
    companyId: string,
    userId: string,
  ): Promise<{ status: ApprovalRequestStatus; removedDates: string[] }> {
    const approval = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({
        id: approvalRequestId,
        companyId,
        category: { code: 'WORK_FROM_HOME' },
      }),
    });
    if (!approval) {
      throw new NotFoundException('Work-from-home request not found');
    }
    const formData = (approval.formData ?? {}) as WorkFromHomeFormData;
    const isHr = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
    const isOpen = OPEN_WFH_STATUSES.includes(approval.status);
    const isApproved = approval.status === ApprovalRequestStatus.APPROVED;
    if (!isOpen && !isApproved) {
      throw new BadRequestException(
        'Only pending or approved work-from-home requests can be cancelled',
      );
    }
    if (isApproved && !isHr) {
      throw new ForbiddenException(
        'Only HR can cancel an approved work-from-home request',
      );
    }
    if (
      isOpen &&
      !isHr &&
      approval.requestedBy !== userId &&
      approval.createdBy !== userId
    ) {
      throw new ForbiddenException(
        'Only the employee, the person who filed it, or HR can cancel this request',
      );
    }

    let removedDates: string[] = [];
    if (isApproved && formData.employeeId) {
      const applied =
        formData.appliedDates ?? workFromHomeFormDates(formData);
      removedDates = await this.removeEmployeeDays(
        companyId,
        formData.employeeId,
        applied,
        userId,
      );
    }

    const now = new Date();
    await this.prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: ApprovalRequestStatus.CANCELLED,
        completedAt: now,
        updatedBy: userId,
        formData: {
          ...formData,
          cancelledAt: now.toISOString(),
          cancelledBy: userId,
          cancelReason: dto.reason?.trim() || null,
        } as Prisma.InputJsonObject,
      },
    });

    if (removedDates.length > 0 && formData.employeeId) {
      await this.recalculateDates(companyId, removedDates, formData.employeeId);
    }
    return { status: ApprovalRequestStatus.CANCELLED, removedDates };
  }

  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return;
    }

    const approval = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({ id: approvalRequestId }),
      include: {
        category: { select: { code: true } },
      },
    });

    if (!approval || approval.category.code !== 'WORK_FROM_HOME') {
      return;
    }

    const formData = (approval.formData ?? {}) as WorkFromHomeFormData;
    const dates = workFromHomeFormDates(formData);

    if (dates.length === 0 || !formData.employeeId) {
      this.logger.warn(
        `WORK_FROM_HOME approval ${approvalRequestId} missing dates/employeeId`,
      );
      return;
    }

    if (decision === 'APPROVED') {
      // Exactly the previewed days; days covered meanwhile are skipped.
      const result = await this.applyEmployeeDays(
        approval.companyId,
        formData.employeeId,
        dates,
        (formData.reason ?? 'Approved work-from-home request').trim(),
        approval.createdBy,
        formData.createdFromAttendanceImport === true,
      );
      await this.prisma.approvalRequest.update({
        where: { id: approval.id },
        data: {
          formData: {
            ...formData,
            appliedDates: result.appliedDates,
            notAppliedDates: result.notAppliedDates,
          } as Prisma.InputJsonObject,
        },
      });
    }
    // Rejected: no day rows were created, nothing to remove.
  }

  /**
   * Adds the employee to each day, then recalculates their attendance once
   * per touched month.
   */
  private async applyEmployeeDays(
    companyId: string,
    employeeId: string,
    dates: ReadonlyArray<string>,
    reason: string,
    actorUserId: string,
    createdFromAttendanceImport: boolean,
  ): Promise<{ appliedDates: string[]; notAppliedDates: string[] }> {
    const appliedDates: string[] = [];
    const notAppliedDates: string[] = [];
    for (const key of dates) {
      const result = await this.applyEmployeeDay(
        companyId,
        employeeId,
        parseDateOnly(key),
        reason,
        actorUserId,
        createdFromAttendanceImport,
      );
      if (result === 'applied') {
        appliedDates.push(key);
      } else if (result === 'conflict') {
        notAppliedDates.push(key);
      }
    }
    if (appliedDates.length > 0) {
      await this.recalculateDates(companyId, appliedDates, employeeId);
    }
    return { appliedDates, notAppliedDates };
  }

  /**
   * Takes the employee off the given days' rows (employee-scoped rows only);
   * a row left with nobody is soft-deleted. Returns the dates changed.
   */
  private async removeEmployeeDays(
    companyId: string,
    employeeId: string,
    dates: ReadonlyArray<string>,
    userId: string,
  ): Promise<string[]> {
    const removed: string[] = [];
    for (const key of dates) {
      const row = await this.prisma.workFromHomeDay.findFirst({
        where: activeOnly({ companyId, date: parseDateOnly(key) }),
      });
      if (
        !row ||
        row.scope !== WorkFromHomeScope.EMPLOYEES ||
        !row.employeeIds.includes(employeeId)
      ) {
        continue;
      }
      const remaining = row.employeeIds.filter((id) => id !== employeeId);
      await this.prisma.workFromHomeDay.update({
        where: { id: row.id },
        data:
          remaining.length > 0
            ? { employeeIds: remaining, updatedBy: userId }
            : { deletedAt: new Date(), deletedBy: userId, updatedBy: userId },
      });
      removed.push(key);
    }
    return removed;
  }

  private async buildRangePlan(
    companyId: string,
    employeeId: string,
    start: Date,
    end: Date,
  ): Promise<WorkFromHomeRangePlan> {
    // Validates order and the 31-day cap before any lookups.
    planWorkFromHomeRange({ start, end, schedule: [], covers: [] });
    const working = await this.workScheduleService.calculateWorkingDays(
      employeeId,
      companyId,
      start,
      end,
    );
    const scheduleDays = working.breakdown.map((row) => ({
      date: row.date,
      type: row.type,
      holidayName: row.holidayName,
    }));
    const candidates = scheduleDays
      .filter(
        (row) =>
          row.date.getUTCDay() !== 0 &&
          (row.type === 'working' || row.type === 'half'),
      )
      .map((row) => ({ date: row.date }));
    const covers = await this.dayCoverage.findCovers(
      companyId,
      employeeId,
      candidates,
      ['LEAVE', 'SITE_ASSIGNMENT', 'WORK_FROM_HOME', 'FIELD_MOVEMENT', 'ATTENDANCE'],
    );
    return planWorkFromHomeRange({ start, end, schedule: scheduleDays, covers });
  }

  private async recalculateDates(
    companyId: string,
    dates: ReadonlyArray<string>,
    employeeId: string,
  ): Promise<void> {
    for (const { month, year } of monthsOfDateKeys(dates)) {
      await this.attendanceService.recalculateCompanyAttendanceMonth(
        companyId,
        month,
        year,
        employeeId,
      );
    }
  }

  private async applyEmployeeDay(
    companyId: string,
    employeeId: string,
    date: Date,
    reason: string,
    actorUserId: string,
    createdFromAttendanceImport = false,
  ): Promise<ApplyDayResult> {
    if (await this.employeeAlreadyCovered(companyId, employeeId, date)) {
      return 'covered';
    }

    const existing = await this.prisma.workFromHomeDay.findFirst({
      where: activeOnly({ companyId, date }),
    });

    if (!existing) {
      await this.prisma.workFromHomeDay.create({
        data: {
          id: randomUUID(),
          companyId,
          date,
          reason,
          scope: WorkFromHomeScope.EMPLOYEES,
          departmentIds: [],
          employeeIds: [employeeId],
          createdFromAttendanceImport,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
      return 'applied';
    }

    if (existing.scope !== WorkFromHomeScope.EMPLOYEES) {
      // ALL / matching DEPARTMENTS rows already covered above; another
      // department's row cannot take a single employee — HR must adjust it.
      this.logger.warn(
        `WFH ${date.toISOString().slice(0, 10)}: department-scoped day exists; employee ${employeeId} not added`,
      );
      return 'conflict';
    }

    await this.prisma.workFromHomeDay.update({
      where: { id: existing.id },
      data: {
        employeeIds: [...existing.employeeIds, employeeId],
        ...(createdFromAttendanceImport
          ? { createdFromAttendanceImport: true }
          : {}),
        updatedBy: actorUserId,
      },
    });
    return 'applied';
  }

  private async mergeEmployeesOntoDay(
    existing: Prisma.WorkFromHomeDayGetPayload<object>,
    employeeIds: string[],
    reason: string,
    userId: string,
    companyId: string,
    ctx: AssignerContext,
  ): Promise<unknown> {
    if (existing.scope === WorkFromHomeScope.ALL) {
      throw new ConflictException(
        'This date is already company-wide work-from-home',
      );
    }
    if (existing.scope === WorkFromHomeScope.DEPARTMENTS) {
      throw new ConflictException(
        'This date already has a department-scoped work-from-home day. Ask HR to edit it.',
      );
    }

    let nextIds = [...new Set([...existing.employeeIds, ...employeeIds])];
    if (!ctx.isHr) {
      const allowed = new Set(
        (
          await this.listAssignableEmployees(userId, companyId)
        ).employees.map((row) => row.id),
      );
      const outside = existing.employeeIds.filter((id) => !allowed.has(id));
      const mine = employeeIds.filter((id) => allowed.has(id));
      nextIds = [...new Set([...outside, ...mine])];
    }

    const updated = await this.prisma.workFromHomeDay.update({
      where: { id: existing.id },
      data: {
        employeeIds: nextIds,
        reason: reason || existing.reason,
        updatedBy: userId,
      },
    });
    await this.recalculateMonth(companyId, existing.date);
    return this.mapRow(updated);
  }

  private async employeeAlreadyCovered(
    companyId: string,
    employeeId: string,
    date: Date,
  ): Promise<boolean> {
    const row = await this.prisma.workFromHomeDay.findFirst({
      where: activeOnly({ companyId, date }),
    });
    if (!row) {
      return false;
    }
    if (row.scope === WorkFromHomeScope.ALL) {
      return true;
    }
    if (row.scope === WorkFromHomeScope.EMPLOYEES) {
      return row.employeeIds.includes(employeeId);
    }
    if (row.scope === WorkFromHomeScope.DEPARTMENTS) {
      const employee = await this.prisma.user.findFirst({
        where: activeOnly({ id: employeeId, companyId }),
        select: { departmentId: true },
      });
      return (
        employee?.departmentId != null &&
        row.departmentIds.includes(employee.departmentId)
      );
    }
    return false;
  }

  private async resolveAssigner(
    userId: string,
    companyId: string,
  ): Promise<AssignerContext> {
    const isHr = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId }),
      include: {
        ledDisciplines: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    return {
      userId,
      isHr,
      ledDisciplineIds: user?.ledDisciplines.map((d) => d.id) ?? [],
    };
  }

  private assertCanAssign(ctx: AssignerContext): void {
    if (!ctx.isHr && ctx.ledDisciplineIds.length === 0) {
      throw new ForbiddenException(
        'Only HR or a Discipline Lead can assign work-from-home days',
      );
    }
  }

  /** Explicitly chosen WFH employees must take part in HR processes. */
  private async assertHrProcessEmployees(
    employeeIds: string[],
    companyId: string,
  ): Promise<void> {
    const unique = [...new Set(employeeIds)];
    if (unique.length === 0) {
      return;
    }
    const eligible = await this.prisma.user.count({
      where: activeOnly(hrProcessEmployeeWhere({ companyId, id: { in: unique } })),
    });
    if (eligible !== unique.length) {
      throw new BadRequestException(
        `${EXCLUDED_FROM_HR_MESSAGE} (or was not found)`,
      );
    }
  }

  private async assertEmployeesUnderDiscipline(
    employeeIds: string[],
    ledDisciplineIds: string[],
    companyId: string,
  ): Promise<string[]> {
    if (employeeIds.length === 0) {
      throw new BadRequestException('Select at least one employee');
    }
    const users = await this.prisma.user.findMany({
      where: activeOnly(
        hrProcessEmployeeWhere({
          companyId,
          id: { in: employeeIds },
          isActive: true,
          engineeringDisciplineId: { in: ledDisciplineIds },
        }),
      ),
      select: { id: true },
    });
    if (users.length !== employeeIds.length) {
      throw new ForbiddenException(
        'You can only assign work-from-home to employees in your discipline(s)',
      );
    }
    return users.map((u) => u.id);
  }

  private validateScopePayload(
    scope: WorkFromHomeScope,
    departmentIds: string[],
    employeeIds: string[],
  ): void {
    if (scope === WorkFromHomeScope.DEPARTMENTS && departmentIds.length === 0) {
      throw new BadRequestException('Select at least one department');
    }
    if (scope === WorkFromHomeScope.EMPLOYEES && employeeIds.length === 0) {
      throw new BadRequestException('Select at least one employee');
    }
  }

  private async findOrThrow(id: string, companyId: string) {
    const row = await this.prisma.workFromHomeDay.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!row) {
      throw new NotFoundException('Work-from-home day not found');
    }
    return row;
  }

  private async recalculateMonth(
    companyId: string,
    date: Date,
    employeeId?: string,
  ): Promise<void> {
    const month = date.getUTCMonth() + 1;
    const year = date.getUTCFullYear();
    await this.attendanceService.recalculateCompanyAttendanceMonth(
      companyId,
      month,
      year,
      employeeId,
    );
  }

  private mapRow(
    row: Prisma.WorkFromHomeDayGetPayload<object>,
    employees: WfhEmployeeSummary[] = [],
  ): unknown {
    return {
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      reason: row.reason,
      scope: row.scope,
      departmentIds: row.departmentIds,
      employeeIds: row.employeeIds,
      employees,
      createdFromAttendanceImport:
        (row as { createdFromAttendanceImport?: boolean })
          .createdFromAttendanceImport === true,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
