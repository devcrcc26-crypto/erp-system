import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogSource,
  EmployeeContractStatus,
  type EmployeeContractType,
  type InactiveType,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { AuditService } from '../../../audit/application/services/audit.service';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { AttendanceService } from '../../../attendance/application/services/attendance.service';
import { EmployeeContractService } from '../../../employee-contract/application/services/employee-contract.service';
import { PasswordService } from '../../../auth/application/services/password.service';
import { generateTemporaryPassword } from '../../../auth/application/utils/password-policy.util';
import { markPayrollAttendanceSnapshotStale } from '../../../attendance/application/utils/attendance-recalc-policy.util';
import { loadPolicySnapshot } from '../../../../shared/policy/policy-reader.util';
import { inactiveSpanOn } from '../../../../shared/employment/inactive-period.util';
import {
  formatDateOnlyUtc,
  parseDateOnlyUtc,
  todayInAddisUtc,
} from '../../../../shared/employment/separation-dates.util';

type Ctx = { companyId: string; userId: string };

const DAY_MS = 86_400_000;
const CONTRACT_ENDED_ROLES = ['HR Officer', 'HR Manager'] as const;
const CONTRACT_ENDED_EVENT = 'employee_contract.ended_not_renewed';

export interface SetInactiveInput {
  type: InactiveType;
  fromDate: string;
  toDate?: string;
  reason: string;
}

export interface RehireInput {
  startDate: string;
  contractType: EmployeeContractType;
  signedAt: string;
  endDate?: string;
  basicSalary: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  pensionApplicable?: boolean;
  reason: string;
}

function parseDate(raw: string | undefined, field: string): Date {
  const date = parseDateOnlyUtc(raw ?? '');
  if (!date) throw new BadRequestException(`${field} must be a date (YYYY-MM-DD)`);
  return date;
}

/**
 * Inactive periods (suspension / long leave), rehire of separated employees and
 * the daily status jobs. Separation itself lives in EmploymentSeparationService.
 */
@Injectable()
export class EmploymentLifecycleService {
  private readonly logger = new Logger(EmploymentLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly attendance: AttendanceService,
    private readonly contracts: EmployeeContractService,
    private readonly passwords: PasswordService,
  ) {}

  // ── inactive ────────────────────────────────────────────────────────────

  async listInactive(ctx: Ctx, userId: string) {
    await this.requireUser(ctx, userId);
    const rows = await this.prisma.inactivePeriod.findMany({
      where: { userId, companyId: ctx.companyId },
      orderBy: { fromDate: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      fromDate: formatDateOnlyUtc(r.fromDate),
      toDate: r.toDate ? formatDateOnlyUtc(r.toDate) : null,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
    }));
  }

  async setInactive(ctx: Ctx, userId: string, input: SetInactiveInput) {
    const user = await this.requireUser(ctx, userId);
    if (user.employmentStatus === 'SEPARATED') {
      throw new BadRequestException('Separated employees cannot be set inactive');
    }
    const reason = input.reason?.trim() ?? '';
    if (!reason) throw new BadRequestException('A reason is required');
    const fromDate = parseDate(input.fromDate, 'fromDate');
    const toDate = input.toDate ? parseDate(input.toDate, 'toDate') : null;
    if (toDate && toDate < fromDate) {
      throw new BadRequestException('toDate must be on or after fromDate');
    }
    const openPeriod = await this.prisma.employmentPeriod.findFirst({
      where: { userId, endDate: null },
      orderBy: { startDate: 'desc' },
    });
    const start = openPeriod?.startDate ?? user.employmentDate;
    if (start && fromDate < start) {
      throw new BadRequestException(
        `The inactive period cannot start before employment (${formatDateOnlyUtc(start)})`,
      );
    }
    const overlap = await this.prisma.inactivePeriod.findFirst({
      where: {
        userId,
        fromDate: toDate ? { lte: toDate } : undefined,
        OR: [{ toDate: null }, { toDate: { gte: fromDate } }],
      },
      select: { id: true },
    });
    if (overlap) {
      throw new BadRequestException('This overlaps another inactive period');
    }

    const created = await this.prisma.inactivePeriod.create({
      data: {
        companyId: ctx.companyId,
        userId,
        type: input.type,
        fromDate,
        toDate,
        reason,
        createdById: ctx.userId,
      },
    });
    await this.applyInactiveStatus(userId, todayInAddisUtc());
    await this.afterAttendanceAffectingChange(ctx, userId, fromDate);
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'users',
        action: 'set_inactive',
        recordType: 'inactive_period',
        recordId: created.id,
        afterValue: {
          employeeId: userId,
          type: input.type,
          fromDate: formatDateOnlyUtc(fromDate),
          toDate: toDate ? formatDateOnlyUtc(toDate) : null,
          reason,
        },
      }),
    );
    return this.listInactive(ctx, userId);
  }

  async reactivate(ctx: Ctx, userId: string, lastInactiveRaw?: string) {
    await this.requireUser(ctx, userId);
    const today = todayInAddisUtc();
    const current = await this.prisma.inactivePeriod.findFirst({
      where: { userId, OR: [{ toDate: null }, { toDate: { gte: today } }] },
      orderBy: { fromDate: 'desc' },
    });
    if (!current) {
      throw new BadRequestException('The employee has no current or upcoming inactive period');
    }
    const lastInactive = lastInactiveRaw
      ? parseDate(lastInactiveRaw, 'lastInactiveDate')
      : new Date(today.getTime() - DAY_MS);

    if (lastInactive < current.fromDate) {
      // Reactivated before it began: the period never applied.
      await this.prisma.inactivePeriod.delete({ where: { id: current.id } });
    } else {
      await this.prisma.inactivePeriod.update({
        where: { id: current.id },
        data: { toDate: lastInactive, endedById: ctx.userId, endedAt: new Date() },
      });
    }
    await this.applyInactiveStatus(userId, today);
    await this.afterAttendanceAffectingChange(ctx, userId, current.fromDate);
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'users',
        action: 'reactivate',
        recordType: 'inactive_period',
        recordId: current.id,
        beforeValue: {
          type: current.type,
          fromDate: formatDateOnlyUtc(current.fromDate),
          toDate: current.toDate ? formatDateOnlyUtc(current.toDate) : null,
        },
        afterValue: { lastInactiveDate: formatDateOnlyUtc(lastInactive) },
      }),
    );
    return this.listInactive(ctx, userId);
  }

  /**
   * Sets employmentStatus and login from the inactive period covering `today`
   * and the inactiveCanLogin policy for that month. Separated users are left alone.
   */
  async applyInactiveStatus(userId: string, today: Date): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, companyId: true, isActive: true, employmentStatus: true },
    });
    if (!user || user.employmentStatus === 'SEPARATED') return false;
    const periods = await this.prisma.inactivePeriod.findMany({
      where: { userId },
      orderBy: { fromDate: 'desc' },
    });
    const current = inactiveSpanOn(today, periods);
    let changed = false;

    if (current) {
      // inactiveSpanOn returns one of the rows it was given.
      const period = periods.find((p) => p === current)!;
      const policy = await loadPolicySnapshot(this.prisma, user.companyId, today);
      const canLogin = policy.inactiveCanLogin[current.type];
      const data: { employmentStatus?: 'INACTIVE'; isActive?: boolean } = {};
      if (user.employmentStatus !== 'INACTIVE') data.employmentStatus = 'INACTIVE';
      if (!canLogin && user.isActive) data.isActive = false;
      if (canLogin && !user.isActive && period.loginDisabledByInactive) data.isActive = true;
      if (Object.keys(data).length > 0) {
        await this.prisma.$transaction(async (tx) => {
          await tx.user.update({ where: { id: userId }, data });
          if (data.isActive === false) {
            await tx.userSession.deleteMany({ where: { userId } });
          }
          if (data.isActive !== undefined) {
            await tx.inactivePeriod.update({
              where: { id: period.id },
              data: { loginDisabledByInactive: data.isActive === false },
            });
          }
        });
        changed = true;
      }
      return changed;
    }

    // Not inactive today: back to ACTIVE; restore login only if an inactive period turned it off.
    const disabledBy = periods.filter((p) => p.loginDisabledByInactive);
    if (user.employmentStatus === 'INACTIVE' || disabledBy.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            employmentStatus: 'ACTIVE',
            ...(disabledBy.length > 0 ? { isActive: true } : {}),
          },
        });
        if (disabledBy.length > 0) {
          await tx.inactivePeriod.updateMany({
            where: { id: { in: disabledBy.map((p) => p.id) } },
            data: { loginDisabledByInactive: false },
          });
        }
      });
      changed = true;
    }
    return changed;
  }

  /** Daily job: periods starting or ending today take effect. Idempotent. */
  async processInactivePeriods(now: Date = new Date()): Promise<{ checked: number; changed: number }> {
    const today = todayInAddisUtc(now);
    const yesterday = new Date(today.getTime() - DAY_MS);
    const candidates = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { not: 'SEPARATED' },
        OR: [
          { employmentStatus: 'INACTIVE' },
          {
            inactivePeriods: {
              some: {
                fromDate: { lte: today },
                OR: [{ toDate: null }, { toDate: { gte: yesterday } }],
              },
            },
          },
          { inactivePeriods: { some: { loginDisabledByInactive: true } } },
        ],
      },
      select: { id: true, companyId: true },
    });
    let changed = 0;
    for (const user of candidates) {
      if (await this.applyInactiveStatus(user.id, today)) {
        changed += 1;
        await this.audit.create({
          companyId: user.companyId,
          source: AuditLogSource.SYSTEM_JOB,
          module: 'users',
          action: 'inactive_status_applied',
          recordType: 'user',
          recordId: user.id,
          afterValue: { date: formatDateOnlyUtc(today) },
        });
      }
    }
    return { checked: candidates.length, changed };
  }

  // ── contract ended without a new contract ───────────────────────────────

  /**
   * Daily job: a contract whose end date has passed, with no later contract and
   * employment still open, is flagged once to HR Officers + HR Managers.
   * Never separates anyone.
   */
  async notifyEndedContracts(now: Date = new Date()): Promise<{ notified: number }> {
    const today = todayInAddisUtc(now);
    const ended = await this.prisma.employeeContract.findMany({
      where: {
        deletedAt: null,
        status: { in: [EmployeeContractStatus.ACTIVE, EmployeeContractStatus.EXPIRED] },
        endDate: { lt: today },
        terminatedAt: null,
        endedNoticeAt: null,
        employee: { deletedAt: null, employmentStatus: { not: 'SEPARATED' } },
      },
      select: {
        id: true,
        companyId: true,
        contractNumber: true,
        employeeId: true,
        endDate: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });
    let notified = 0;
    for (const contract of ended) {
      const newer = await this.prisma.employeeContract.count({
        where: {
          employeeId: contract.employeeId,
          deletedAt: null,
          startDate: { gt: contract.endDate! },
        },
      });
      if (newer > 0) continue;

      const recipients = await this.prisma.userRole.findMany({
        where: {
          deletedAt: null,
          role: { companyId: contract.companyId, deletedAt: null, name: { in: [...CONTRACT_ENDED_ROLES] } },
          user: { companyId: contract.companyId, deletedAt: null, isActive: true },
        },
        select: { userId: true },
      });
      const name = `${contract.employee.firstName} ${contract.employee.lastName}`.trim();
      for (const recipientId of new Set(recipients.map((r) => r.userId))) {
        try {
          await this.notifications.send(
            { companyId: contract.companyId, userId: recipientId },
            {
              recipientId,
              eventType: CONTRACT_ENDED_EVENT,
              channel: 'IN_APP',
              subject: `Contract ended - renew, convert or separate: ${name}`,
              body: `${name}'s contract ${contract.contractNumber} ended on ${formatDateOnlyUtc(contract.endDate!)} and there is no new contract. They remain employed and are paid on the last contract until you renew, convert (e.g. to freelancer) or separate them.`,
              link: `/hr/employee-contract/${contract.id}`,
            },
          );
        } catch (error) {
          this.logger.warn(
            `Contract-ended notice for ${contract.contractNumber} to ${recipientId} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      await this.prisma.employeeContract.update({
        where: { id: contract.id },
        data: { endedNoticeAt: new Date() },
      });
      notified += 1;
    }
    return { notified };
  }

  // ── rehire ──────────────────────────────────────────────────────────────

  async rehire(ctx: Ctx, userId: string, input: RehireInput) {
    const user = await this.requireUser(ctx, userId);
    if (user.employmentStatus !== 'SEPARATED') {
      throw new BadRequestException('Only separated employees can be rehired');
    }
    const reason = input.reason?.trim() ?? '';
    if (!reason) throw new BadRequestException('A reason is required');
    const startDate = parseDate(input.startDate, 'startDate');
    const periods = await this.prisma.employmentPeriod.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
    });
    if (periods.some((p) => p.endDate == null)) {
      throw new BadRequestException('The employee already has an open employment period');
    }
    const lastEnd = periods[0]?.endDate ?? null;
    if (lastEnd && startDate <= lastEnd) {
      throw new BadRequestException(
        `The new start must be after the last working day (${formatDateOnlyUtc(lastEnd)})`,
      );
    }

    // Contract first: its validation (dates, type) decides whether the rehire is valid.
    await this.contracts.createContract(
      {
        employeeId: userId,
        contractType: input.contractType,
        signedAt: input.signedAt,
        startDate: input.startDate,
        endDate: input.endDate,
        basicSalary: input.basicSalary,
        transportationAllowance: input.transportationAllowance,
        monthlyBonus: input.monthlyBonus,
        pensionApplicable: input.pensionApplicable,
        notes: `Rehire: ${reason}`,
      },
      ctx.companyId,
      ctx.userId,
    );

    const temporaryPassword = generateTemporaryPassword(12);
    const passwordHash = await this.passwords.hash(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.employmentPeriod.create({
        data: { companyId: ctx.companyId, userId, startDate, createdBy: ctx.userId },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          employmentDate: startDate,
          employmentStatus: 'ACTIVE',
          isActive: true,
          passwordHash,
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedBy: ctx.userId,
        },
      });
    });
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'users',
        action: 'rehire',
        recordType: 'user',
        recordId: userId,
        beforeValue: { employmentDate: user.employmentDate ? formatDateOnlyUtc(user.employmentDate) : null },
        afterValue: { employmentDate: formatDateOnlyUtc(startDate), reason, mustChangePassword: true },
      }),
    );
    return { temporaryPassword, mustChangePassword: true as const };
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async requireUser(ctx: Ctx, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      select: { id: true, employmentDate: true, employmentStatus: true, isActive: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Recalculate attendance from the change onward and mark affected payroll runs stale. */
  private async afterAttendanceAffectingChange(ctx: Ctx, userId: string, from: Date): Promise<void> {
    try {
      await this.attendance.recalculateEmployeeAttendanceFromDate(userId, ctx.companyId, from);
    } catch (error) {
      this.logger.warn(
        `Attendance recalculation after inactive change for ${userId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const runs = await this.prisma.payrollRun.findMany({
      where: {
        companyId: ctx.companyId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        OR: [
          { year: { gt: from.getUTCFullYear() } },
          { year: from.getUTCFullYear(), month: { gte: from.getUTCMonth() + 1 } },
        ],
      },
      select: { month: true, year: true },
    });
    for (const run of runs) {
      await markPayrollAttendanceSnapshotStale(this.prisma, ctx.companyId, run.month, run.year);
    }
  }
}
