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
import type {
  CreateWorkFromHomeDayDto,
  RequestWorkFromHomeDayDto,
  UpdateWorkFromHomeDayDto,
} from '../dtos/work-from-home-day.dto';
import { parseDateOnly } from './work-schedule.dates';

interface AssignerContext {
  userId: string;
  isHr: boolean;
  ledDisciplineIds: string[];
}

interface AssignableEmployee {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  department: string | null;
  discipline: string | null;
}

/**
 * Work-from-home calendar days (attendance credit).
 * - Employees request a date → Discipline Lead approval.
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
    return rows.map((row) => this.mapRow(row));
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
      ? activeOnly({ companyId, isActive: true })
      : activeOnly({
          companyId,
          isActive: true,
          engineeringDisciplineId: { in: ctx.ledDisciplineIds },
        });

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
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
        lastName: user.lastName,
        employeeId: user.employeeId,
        department: user.department?.name ?? null,
        discipline: user.engineeringDiscipline?.name ?? null,
      })),
    };
  }

  /**
   * Direct assignment by HR (any scope) or Discipline Lead (employees under them).
   */
  async create(
    dto: CreateWorkFromHomeDayDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const ctx = await this.resolveAssigner(userId, companyId);
    this.assertCanAssign(ctx);

    const date = parseDateOnly(dto.date);
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

    this.validateScopePayload(scope, departmentIds, employeeIds);

    const existing = await this.prisma.workFromHomeDay.findFirst({
      where: activeOnly({ companyId, date }),
    });

    if (existing) {
      if (scope === WorkFromHomeScope.EMPLOYEES) {
        return this.mergeEmployeesOntoDay(
          existing,
          employeeIds,
          dto.reason.trim(),
          userId,
          companyId,
          ctx,
        );
      }
      throw new ConflictException(
        'A work-from-home day already exists for this date',
      );
    }

    try {
      const created = await this.prisma.workFromHomeDay.create({
        data: {
          id: randomUUID(),
          companyId,
          date,
          reason: dto.reason.trim(),
          scope,
          departmentIds,
          employeeIds,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await this.recalculateMonth(companyId, date);
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
   * Employee (or on-behalf) request — opens Employee → Discipline Lead approval.
   */
  async submitRequest(
    dto: RequestWorkFromHomeDayDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    const date = parseDateOnly(dto.date);
    const dateKey = date.toISOString().slice(0, 10);
    const reason = dto.reason.trim();

    if (await this.employeeAlreadyCovered(companyId, employeeId, date)) {
      throw new ConflictException(
        'This employee already has work-from-home credit for that date',
      );
    }

    await this.assertNoPendingRequest(companyId, employeeId, dateKey);

    const resolvedTiers =
      await this.hrApprovalChain.buildSiteAssignmentApprovalChain(
        employeeId,
        companyId,
      );

    const title = `Work from home — ${dateKey}`;

    if (resolvedTiers.length === 0) {
      await this.applyEmployeeDay(
        companyId,
        employeeId,
        date,
        reason,
        userId,
        dto.createdFromAttendanceImport === true,
      );
      await this.onBehalfService.recordOnBehalfCreate({
        moduleCode: 'WORK_FROM_HOME',
        companyId,
        actorUserId: userId,
        employeeId,
        recordId: `${dateKey}:${employeeId}`,
        recordReference: title,
      });
      return {
        autoApproved: true,
        date: dateKey,
        employeeId,
      };
    }

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'WORK_FROM_HOME',
        title,
        formData: {
          date: dateKey,
          reason,
          employeeId,
          createdFromAttendanceImport:
            dto.createdFromAttendanceImport === true,
        },
      },
      companyId,
      employeeId,
      {
        resolvedTiers: {
          ruleName: 'Work from home — Discipline Lead only',
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
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

    const formData = approval.formData as {
      date?: string;
      reason?: string;
      employeeId?: string;
      createdFromAttendanceImport?: boolean;
    };

    if (!formData.date || !formData.employeeId) {
      this.logger.warn(
        `WORK_FROM_HOME approval ${approvalRequestId} missing date/employeeId`,
      );
      return;
    }

    if (decision === 'APPROVED') {
      await this.applyEmployeeDay(
        approval.companyId,
        formData.employeeId,
        parseDateOnly(formData.date),
        (formData.reason ?? 'Approved work-from-home request').trim(),
        approval.createdBy,
        formData.createdFromAttendanceImport === true,
      );
      return;
    }

    const date = parseDateOnly(formData.date);
    await this.recalculateMonth(
      approval.companyId,
      date,
      formData.employeeId,
    );
  }

  private async applyEmployeeDay(
    companyId: string,
    employeeId: string,
    date: Date,
    reason: string,
    actorUserId: string,
    createdFromAttendanceImport = false,
  ): Promise<void> {
    if (await this.employeeAlreadyCovered(companyId, employeeId, date)) {
      return;
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
      await this.recalculateMonth(companyId, date, employeeId);
      return;
    }

    if (existing.scope === WorkFromHomeScope.ALL) {
      return;
    }

    if (existing.scope === WorkFromHomeScope.DEPARTMENTS) {
      const employee = await this.prisma.user.findFirst({
        where: activeOnly({ id: employeeId, companyId }),
        select: { departmentId: true },
      });
      if (
        employee?.departmentId &&
        existing.departmentIds.includes(employee.departmentId)
      ) {
        return;
      }
      throw new ConflictException(
        'A department-scoped work-from-home day already exists for this date. Ask HR to adjust it.',
      );
    }

    if (!existing.employeeIds.includes(employeeId)) {
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
      await this.recalculateMonth(companyId, date, employeeId);
    }
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

  private async assertNoPendingRequest(
    companyId: string,
    employeeId: string,
    dateKey: string,
  ): Promise<void> {
    const pending = await this.prisma.approvalRequest.findMany({
      where: activeOnly({
        companyId,
        status: {
          in: [
            ApprovalRequestStatus.PENDING,
            ApprovalRequestStatus.SUBMITTED,
            ApprovalRequestStatus.IN_REVIEW,
            ApprovalRequestStatus.RETURNED,
          ],
        },
        category: { code: 'WORK_FROM_HOME' },
      }),
      select: { formData: true, requestNumber: true },
    });

    for (const row of pending) {
      const data = row.formData as { date?: string; employeeId?: string };
      if (data.date === dateKey && data.employeeId === employeeId) {
        throw new ConflictException(
          `A pending work-from-home request already exists (${row.requestNumber})`,
        );
      }
    }
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

  private async assertEmployeesUnderDiscipline(
    employeeIds: string[],
    ledDisciplineIds: string[],
    companyId: string,
  ): Promise<string[]> {
    if (employeeIds.length === 0) {
      throw new BadRequestException('Select at least one employee');
    }
    const users = await this.prisma.user.findMany({
      where: activeOnly({
        companyId,
        id: { in: employeeIds },
        isActive: true,
        engineeringDisciplineId: { in: ledDisciplineIds },
      }),
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

  private mapRow(row: Prisma.WorkFromHomeDayGetPayload<object>): unknown {
    return {
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      reason: row.reason,
      scope: row.scope,
      departmentIds: row.departmentIds,
      employeeIds: row.employeeIds,
      createdFromAttendanceImport:
        (row as { createdFromAttendanceImport?: boolean })
          .createdFromAttendanceImport === true,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
