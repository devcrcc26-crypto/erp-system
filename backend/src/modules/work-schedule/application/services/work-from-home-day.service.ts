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
  RequestInitiatorType,
  WorkFromHomeScope,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../../../audit/application/services/audit.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { resolveTeamScopedEmployeeIds } from '../../../../shared/org/team-scope.util';
import { assertWithinEmploymentWindow } from '../../../../shared/employment/employment-guard.util';
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
  UpdateWorkFromHomeRequestDto,
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

const WFH_DIRECT_ASSIGN_MANAGE_ONLY =
  'Only users with wfh.manage can assign work-from-home days directly. Others submit a work-from-home request.';

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
 * - Employees request a date range → Reports to → HR Officer approval. One
 *   approval request per range; approval creates the per-day rows for working days.
 * - Users with wfh.manage assign directly (anyone / departments / company-wide).
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
    private readonly audit: AuditService,
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
    /** Limits rows and their employee lists to these people (team view). */
    onlyEmployeeIds?: readonly string[],
  ): Promise<unknown[]> {
    const where: Prisma.WorkFromHomeDayWhereInput = activeOnly({ companyId });
    if (month != null && year != null) {
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0));
      where.date = { gte: start, lte: end };
    }
    if (onlyEmployeeIds) {
      const departmentIds = (
        await this.prisma.user.findMany({
          where: { companyId, id: { in: [...onlyEmployeeIds] } },
          select: { departmentId: true },
        })
      )
        .map((user) => user.departmentId)
        .filter((id): id is string => Boolean(id));
      // Company-wide days, days for a team member's department, and days
      // naming a team member.
      where.OR = [
        { scope: 'ALL' },
        { scope: 'DEPARTMENTS', departmentIds: { hasSome: departmentIds } },
        { scope: 'EMPLOYEES', employeeIds: { hasSome: [...onlyEmployeeIds] } },
      ];
    }
    const found = await this.prisma.workFromHomeDay.findMany({
      where,
      orderBy: { date: 'asc' },
    });
    const allowed = onlyEmployeeIds ? new Set(onlyEmployeeIds) : null;
    const rows = allowed
      ? found.map((row) => ({
          ...row,
          employeeIds: row.employeeIds.filter((id) => allowed.has(id)),
        }))
      : found;
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
   * List for assigners (HR only). Everyone else uses New Request.
   */
  async listForAssigner(
    companyId: string,
    userId: string,
    month?: number,
    year?: number,
  ): Promise<unknown[]> {
    if (await this.permissionService.hasPermission(userId, companyId, 'wfh', 'manage')) {
      return this.list(companyId, month, year);
    }
    // Everyone else (supervisors included) sees only their own and their
    // team's work-from-home days, never the whole company's.
    return this.list(
      companyId,
      month,
      year,
      await resolveTeamScopedEmployeeIds(this.prisma, userId, companyId),
    );
  }

  /**
   * Employees HR may assign WFH to directly (any HR-process employee).
   */
  async listAssignableEmployees(
    userId: string,
    companyId: string,
  ): Promise<{
    canAssignCompanyWide: boolean;
    isDisciplineLead: boolean;
    employees: AssignableEmployee[];
  }> {
    await this.assertCanManageWfh(userId, companyId);

    const where: Prisma.UserWhereInput = activeOnly(
      hrProcessEmployeeWhere({ companyId, isActive: true }),
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
      canAssignCompanyWide: true,
      // Kept for API compatibility: Discipline Leads no longer assign directly.
      isDisciplineLead: false,
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
   * Direct assignment by HR (no approval; audit-logged).
   * Accepts a single `date` or an inclusive `startDate`–`endDate` range
   * (one calendar day row per date; employee-scope merges into existing days).
   */
  async create(
    dto: CreateWorkFromHomeDayDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertCanManageWfh(userId, companyId);

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

    const scope = dto.scope ?? WorkFromHomeScope.ALL;
    const departmentIds =
      scope === WorkFromHomeScope.DEPARTMENTS ? (dto.departmentIds ?? []) : [];
    const employeeIds =
      scope === WorkFromHomeScope.EMPLOYEES ? (dto.employeeIds ?? []) : [];

    await this.assertHrProcessEmployees(employeeIds, companyId);
    // Named employees only; company/department-wide WFH applies to whoever is employed that day.
    for (const employeeId of employeeIds) {
      await assertWithinEmploymentWindow(this.prisma, employeeId, dates);
    }

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
        }),
      );
    }
    await this.writeAssignAudit(companyId, userId, 'create', `${startKey}:${endKey}`, null, {
      startDate: startKey,
      endDate: endKey,
      scope,
      departmentIds,
      employeeIds,
      reason: dto.reason.trim(),
      days: dates.length,
    });
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
   * Updates a WFH day (HR only; audit-logged).
   */
  async update(
    id: string,
    dto: UpdateWorkFromHomeDayDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertCanManageWfh(userId, companyId);

    const existing = await this.findOrThrow(id, companyId);

    const nextScope = dto.scope ?? existing.scope;
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
    await this.writeAssignAudit(
      companyId,
      userId,
      'update',
      id,
      {
        date: existing.date.toISOString().slice(0, 10),
        scope: existing.scope,
        departmentIds: existing.departmentIds,
        employeeIds: existing.employeeIds,
        reason: existing.reason,
      },
      {
        date: updated.date.toISOString().slice(0, 10),
        scope: updated.scope,
        departmentIds: updated.departmentIds,
        employeeIds: updated.employeeIds,
        reason: updated.reason,
      },
    );
    return this.mapRow(updated);
  }

  /**
   * Soft-deletes a WFH day (HR only; audit-logged).
   */
  async remove(id: string, companyId: string, userId: string): Promise<void> {
    await this.assertCanManageWfh(userId, companyId);
    const existing = await this.findOrThrow(id, companyId);

    await this.prisma.workFromHomeDay.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });
    await this.recalculateMonth(companyId, existing.date);
    await this.writeAssignAudit(
      companyId,
      userId,
      'delete',
      id,
      {
        date: existing.date.toISOString().slice(0, 10),
        scope: existing.scope,
        departmentIds: existing.departmentIds,
        employeeIds: existing.employeeIds,
        reason: existing.reason,
      },
      { deleted: true },
    );
  }

  /** Audit entry for HR direct assignment (no approval request exists). */
  private async writeAssignAudit(
    companyId: string,
    userId: string,
    action: 'create' | 'update' | 'delete',
    recordId: string,
    beforeValue: Record<string, unknown> | null,
    afterValue: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId,
        companyId,
        module: 'work_from_home',
        action: `direct_assign_${action}`,
        recordType: 'work_from_home_day',
        recordId,
        beforeValue: (beforeValue ?? undefined) as Prisma.InputJsonValue | undefined,
        afterValue: afterValue as Prisma.InputJsonValue,
      }),
    );
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
    const { employeeId } = await this.onBehalfService.resolveInitiation(
      userId,
      companyId,
      'WORK_FROM_HOME',
      dto.onBehalfOfEmployeeId,
      { hrProcess: true },
    );
    // Only the requester's own WFH request can be excluded from coverage.
    const editing = dto.editingRequestId
      ? await this.prisma.approvalRequest.findFirst({
          where: activeOnly({
            id: dto.editingRequestId,
            companyId,
            requestedBy: employeeId,
            category: { code: 'WORK_FROM_HOME' },
          }),
          select: { requestNumber: true },
        })
      : null;
    const plan = await this.buildRangePlan(
      companyId,
      employeeId,
      parseDateOnly(dto.startDate),
      parseDateOnly(dto.endDate),
      editing?.requestNumber,
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
   * Employee (or on-behalf) request for a date range - opens one
   * Reports to → HR Officer approval carrying the list of working days.
   */
  async submitRequest(
    dto: RequestWorkFromHomeDayDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const { employeeId, initiatedAs } = await this.onBehalfService.resolveInitiation(
      userId,
      companyId,
      'WORK_FROM_HOME',
      dto.onBehalfOfEmployeeId,
      { hrProcess: true },
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

    let resolvedTiers =
      await this.hrApprovalChain.buildWorkFromHomeApprovalChain(
        employeeId,
        companyId,
      );
    if (initiatedAs === RequestInitiatorType.SUPERVISOR) {
      resolvedTiers = await this.hrApprovalChain.startChainAboveSubmitter(
        resolvedTiers,
        userId,
        companyId,
      );
    }

    const title = `Work from home - ${formatWorkFromHomeRangeLabel(
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
          ruleName: 'Work from home - Reports to → HR Officer',
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
   * Employee edits their own RETURNED work-from-home request (the request
   * lives entirely in the approval's formData). The range is re-planned
   * exactly as on submit. Saves only: it stays RETURNED until resubmitted
   * from Approvals.
   */
  async updateRequest(
    approvalRequestId: string,
    dto: UpdateWorkFromHomeRequestDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const approval = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({
        id: approvalRequestId,
        companyId,
        category: { code: 'WORK_FROM_HOME' },
      }),
      select: {
        id: true,
        requestNumber: true,
        requestedBy: true,
        status: true,
        formData: true,
      },
    });
    if (!approval) {
      throw new NotFoundException('Work-from-home request not found');
    }
    if (approval.requestedBy !== userId) {
      throw new ForbiddenException('You can only edit your own requests.');
    }
    if (approval.status !== ApprovalRequestStatus.RETURNED) {
      throw new ForbiddenException('This request can no longer be edited.');
    }

    const previous = (approval.formData ?? {}) as Partial<WorkFromHomeFormData>;
    const reason = dto.reason.trim();
    const plan = await this.buildRangePlan(
      companyId,
      userId,
      parseDateOnly(dto.startDate),
      parseDateOnly(dto.endDate),
      approval.requestNumber,
    );
    if (plan.dates.length === 0) {
      throw new BadRequestException(
        'None of the selected days can be work from home (Sundays, holidays, leave, site assignments or existing work from home)',
      );
    }

    const backdating = await this.backdatingPolicy.validateSubmissionDates({
      companyId,
      actorUserId: userId,
      targetEmployeeId: userId,
      dates: plan.dates.map((key) => parseDateOnly(key)),
      lateReason: dto.lateReason,
    });

    const formData: WorkFromHomeFormData = {
      startDate: plan.startDate,
      endDate: plan.endDate,
      dates: plan.dates,
      skipped: plan.skipped,
      reason,
      employeeId: userId,
      createdFromAttendanceImport: previous.createdFromAttendanceImport === true,
    };

    await this.prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        title: `Work from home - ${formatWorkFromHomeRangeLabel(
          plan.startDate,
          plan.endDate,
          plan.workingDays,
        )}`,
        formData: formData as Prisma.InputJsonObject,
        isLateSubmission: backdating.isLateSubmission,
        lateReason: backdating.lateReason,
        updatedBy: userId,
      },
    });

    return this.approvalsService.getRequest(approval.id, companyId, userId);
  }

  /**
   * Cancels a work-from-home request. Pending: the employee, the person who
   * filed it, or HR - nothing was created, so nothing is removed. Approved:
   * HR only - removes the day rows this request added and recalculates.
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

  /**
   * `excludeRequestNumber`: an open WFH request being edited, whose own days
   * must not count as "already requested".
   */
  private async buildRangePlan(
    companyId: string,
    employeeId: string,
    start: Date,
    end: Date,
    excludeRequestNumber?: string,
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
      // Attendance arrives after month-end — do not skip WFH days for scans at request time.
      ['LEAVE', 'SITE_ASSIGNMENT', 'WORK_FROM_HOME', 'FIELD_MOVEMENT'],
    );
    const relevantCovers = excludeRequestNumber
      ? covers.filter(
          (cover) =>
            !(
              cover.module === 'WORK_FROM_HOME' &&
              cover.state === 'REQUESTED' &&
              cover.reference === excludeRequestNumber
            ),
        )
      : covers;
    return planWorkFromHomeRange({
      start,
      end,
      schedule: scheduleDays,
      covers: relevantCovers,
    });
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
      // department's row cannot take a single employee - HR must adjust it.
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

    const nextIds = [...new Set([...existing.employeeIds, ...employeeIds])];

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

  private async assertCanManageWfh(
    userId: string,
    companyId: string,
  ): Promise<void> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'wfh',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException(WFH_DIRECT_ASSIGN_MANAGE_ONLY);
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
