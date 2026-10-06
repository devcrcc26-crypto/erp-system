import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  type EmployeeContract,
  type EmployeeType,
  type PayrollEntry,
  type PayrollEntryFlag,
  type PayrollRun,
  type Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { randomUUID } from 'crypto';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  PayrollCalculationService,
  type OvertimeHours,
  type PayrollCalculationResult,
} from './payroll-calculation.service';
import {
  employedCalendarWindow,
  employedPayrollDays,
} from '../utils/payroll-days.util';

interface ServiceContext {
  userId: string;
  companyId: string;
}

interface GetRunOptions {
  maskBank?: boolean;
}

interface SubmitRunOptions {
  acknowledgeFlags?: boolean;
}

interface CapturedTopUp {
  bonusTopUp: number;
  bonusTopUpReason: string | null;
  netTopUp: number;
  netTopUpReason: string | null;
  notes: string | null;
}

interface ContractSnapshot {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date | null;
  status: EmployeeContract['status'];
  basicSalary: Decimal | null;
  transportationAllowance: Decimal | null;
  monthlyBonus: Decimal | null;
  monthlyNetBonus: Decimal;
  pensionApplicable: boolean;
  taxApplicable: boolean;
}

interface EmployeeSnapshot {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  employeeType: EmployeeType | null;
  bankName: string | null;
  bankAccountNumber: string | null;
}

interface AttendanceSnapshot {
  id: string;
  employeeId: string;
  scheduledDays: Decimal;
  presentDays: Decimal;
  absentDays: Decimal;
  paidDays: Decimal;
}

interface OvertimeSnapshot {
  id: string;
  employeeId: string;
  totalRegularHours: Decimal | null;
  totalNightHours: Decimal | null;
  totalWeekendHours: Decimal | null;
  totalHolidayHours: Decimal | null;
}

interface SalaryPeriodDraft {
  id: string;
  entryId: string;
  contractId: string;
  periodStart: Date;
  periodEnd: Date;
  days: number;
  basicSalary: number;
  earnedSalary: number;
}

interface EntryDraft {
  entry: Prisma.PayrollEntryCreateManyInput;
  salaryPeriods: SalaryPeriodDraft[];
}

interface DateWindow {
  windowStart: Date;
  windowEnd: Date;
}

const ENTRY_WRITE_CHUNK = 50;

const HR_MANAGER_ROLE = 'HR Manager';
const LOCAL_HR_MANAGER_ROLE = 'Local HR Manager';
const GENERAL_MANAGER_ROLE = 'General Manager';
const SYSTEM_ADMINISTRATOR_ROLE = 'System Administrator';

const APPROVE_ROLES: readonly string[] = [
  HR_MANAGER_ROLE,
  SYSTEM_ADMINISTRATOR_ROLE,
];

const GM_APPROVE_ROLES: readonly string[] = [
  GENERAL_MANAGER_ROLE,
  SYSTEM_ADMINISTRATOR_ROLE,
];

@Injectable()
export class PayrollRunService {
  private readonly logger = new Logger(PayrollRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calc: PayrollCalculationService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Creates a DRAFT payroll run for the month/year, or reuses a CANCELLED one.
   */
  async createRun(
    month: number,
    year: number,
    ctx: ServiceContext,
    notes?: string,
  ): Promise<PayrollRun> {
    if (month < 1 || month > 12) {
      throw new BadRequestException('Month must be between 1 and 12');
    }

    const existing = await this.prisma.payrollRun.findFirst({
      where: { companyId: ctx.companyId, month, year, deletedAt: null },
    });

    let runId: string;

    if (existing) {
      if (existing.status !== 'CANCELLED') {
        throw new BadRequestException(
          `Payroll run for ${month}/${year} already exists`,
        );
      }

      await this.prisma.payrollSalaryPeriod.deleteMany({
        where: { entry: { runId: existing.id } },
      });
      await this.prisma.payrollEntry.deleteMany({
        where: { runId: existing.id },
      });

      await this.prisma.payrollRun.update({
        where: { id: existing.id },
        data: {
          status: 'DRAFT',
          notes: notes ?? existing.notes,
          totalEmployees: 0,
          totalGross: new Decimal(0),
          totalNetPay: new Decimal(0),
          totalNetBonus: new Decimal(0),
          totalPensionEmp: new Decimal(0),
          totalPensionEmr: new Decimal(0),
          totalTax: new Decimal(0),
          submittedAt: null,
          submittedBy: null,
          approvedAt: null,
          approvedBy: null,
          gmApprovedAt: null,
          gmApprovedBy: null,
          paidAt: null,
          paidBy: null,
          updatedBy: ctx.userId,
        },
      });

      runId = existing.id;
      this.logger.log(
        `[PayrollRun] Reused CANCELLED run ${existing.runNumber} for ${month}/${year}`,
      );
    } else {
      const runNumber = this.generateRunNumber(month, year);
      const run = await this.prisma.payrollRun.create({
        data: {
          id: randomUUID(),
          companyId: ctx.companyId,
          runNumber,
          month,
          year,
          status: 'DRAFT',
          notes: notes ?? null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      runId = run.id;
      this.logger.log(
        `[PayrollRun] Created run ${runNumber} for ${month}/${year}`,
      );
    }

    await this.generateEntries(runId, ctx);
    return this.getRun(runId, ctx.companyId);
  }

  /**
   * Bulk-generates payroll entries for a run (target &lt;10s for ~150 employees).
   */
  async generateEntries(
    runId: string,
    ctx: ServiceContext,
  ): Promise<PayrollRun> {
    const started = Date.now();
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId: ctx.companyId, deletedAt: null },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    await this.prisma.payrollSalaryPeriod.deleteMany({
      where: { entry: { runId } },
    });
    await this.prisma.payrollEntry.deleteMany({ where: { runId } });

    const drafts = await this.buildEntryDrafts(run, ctx, new Map());
    await this.persistEntryDrafts(drafts, ctx);
    await this.updateRunTotals(runId, ctx);

    const elapsedMs = Date.now() - started;
    this.logger.log(
      `[PayrollRun] Generated ${drafts.length} entries for ${run.runNumber} in ${elapsedMs}ms`,
    );

    return this.getRun(runId, ctx.companyId);
  }

  /**
   * Recalculates a DRAFT/REVIEWED run, preserving bonus top-ups and notes.
   */
  async recalculate(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    const started = Date.now();
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId: ctx.companyId, deletedAt: null },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    if (run.status !== 'DRAFT' && run.status !== 'REVIEWED') {
      throw new BadRequestException(
        `Cannot recalculate run in ${run.status} status`,
      );
    }

    const existingEntries = await this.prisma.payrollEntry.findMany({
      where: { runId },
      select: {
        employeeId: true,
        bonusTopUp: true,
        bonusTopUpReason: true,
        netTopUp: true,
        netTopUpReason: true,
        notes: true,
      },
    });

    const captured = new Map<string, CapturedTopUp>();
    for (const entry of existingEntries) {
      const bonusTopUp = this.toNumber(entry.bonusTopUp);
      const netTopUp = this.toNumber(entry.netTopUp);
      if (
        bonusTopUp !== 0 ||
        entry.bonusTopUpReason != null ||
        netTopUp !== 0 ||
        entry.netTopUpReason != null ||
        entry.notes != null
      ) {
        captured.set(entry.employeeId, {
          bonusTopUp,
          bonusTopUpReason: entry.bonusTopUpReason,
          netTopUp,
          netTopUpReason: entry.netTopUpReason,
          notes: entry.notes,
        });
      }
    }

    await this.prisma.payrollSalaryPeriod.deleteMany({
      where: { entry: { runId } },
    });
    await this.prisma.payrollEntry.deleteMany({ where: { runId } });

    // Regenerate without top-ups, then reapply captured adjustments.
    const drafts = await this.buildEntryDrafts(run, ctx, new Map());
    await this.persistEntryDrafts(drafts, ctx);

    if (captured.size > 0) {
      const topUpEntries = await this.prisma.payrollEntry.findMany({
        where: {
          runId,
          employeeId: { in: [...captured.keys()] },
        },
      });

      for (const entry of topUpEntries) {
        const topUp = captured.get(entry.employeeId);
        if (!topUp) {
          continue;
        }

        if (topUp.bonusTopUp === 0 && topUp.netTopUp === 0) {
          await this.prisma.payrollEntry.update({
            where: { id: entry.id },
            data: {
              bonusTopUpReason: topUp.bonusTopUpReason,
              netTopUpReason: topUp.netTopUpReason,
              notes: topUp.notes ?? entry.notes,
              updatedBy: ctx.userId,
            },
          });
          continue;
        }

        const result = await this.recalcEntryAmounts(entry, run, {
          bonusTopUp: topUp.bonusTopUp,
          netTopUp: topUp.netTopUp,
        });
        await this.prisma.payrollEntry.update({
          where: { id: entry.id },
          data: {
            bonusTopUp: new Decimal(topUp.bonusTopUp),
            bonusTopUpReason: topUp.bonusTopUpReason,
            netTopUp: new Decimal(topUp.netTopUp),
            netTopUpReason: topUp.netTopUpReason,
            notes: topUp.notes ?? entry.notes,
            ...this.calculationToEntryUpdate(result),
            updatedBy: ctx.userId,
          },
        });
      }
    }

    await this.updateRunTotals(runId, ctx);

    const elapsedMs = Date.now() - started;
    this.logger.log(
      `[PayrollRun] Recalculated ${run.runNumber} (${drafts.length} entries) in ${elapsedMs}ms`,
    );

    return this.getRun(runId, ctx.companyId);
  }

  /**
   * Returns a payroll run with entries, employee org fields, and salary periods.
   */
  async getRun(
    runId: string,
    companyId: string,
    options?: GetRunOptions,
  ): Promise<PayrollRun> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId, deletedAt: null },
      include: {
        entries: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeId: true,
                department: { select: { id: true, name: true } },
                engineeringDiscipline: { select: { id: true, name: true } },
              },
            },
            salaryPeriods: true,
            payslip: {
              select: {
                id: true,
                generatedAt: true,
                releasedAt: true,
                downloadedAt: true,
              },
            },
          },
          orderBy: { employee: { firstName: 'asc' } },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    if (options?.maskBank) {
      for (const entry of run.entries) {
        entry.bankAccountNumber = this.maskBankAccount(entry.bankAccountNumber);
      }
    }

    return run;
  }

  /**
   * Lists payroll runs for a company with entry counts and flagged counts.
   */
  async listRuns(companyId: string): Promise<
    Array<
      PayrollRun & {
        _count: { entries: number };
        flaggedCount: number;
      }
    >
  > {
    const runs = await this.prisma.payrollRun.findMany({
      where: { companyId, deletedAt: null },
      include: {
        _count: { select: { entries: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    if (runs.length === 0) {
      return [];
    }

    const flaggedGroups = await this.prisma.payrollEntry.groupBy({
      by: ['runId'],
      where: {
        runId: { in: runs.map((r) => r.id) },
        flag: { not: 'NONE' },
      },
      _count: { _all: true },
    });

    const flaggedByRun = new Map(
      flaggedGroups.map((g) => [g.runId, g._count._all]),
    );

    return runs.map((run) => ({
      ...run,
      flaggedCount: flaggedByRun.get(run.id) ?? 0,
    }));
  }

  /**
   * Marks a DRAFT run as REVIEWED.
   */
  async markReviewed(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status !== 'DRAFT') {
      throw new BadRequestException(
        `Run must be in DRAFT status to mark reviewed`,
      );
    }

    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'REVIEWED',
        updatedBy: ctx.userId,
      },
    });
  }

  /**
   * Submits a REVIEWED run for HR approval. Requires acknowledgeFlags when flagged.
   */
  async submitRun(
    runId: string,
    ctx: ServiceContext,
    options?: SubmitRunOptions,
  ): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status !== 'REVIEWED') {
      throw new BadRequestException(
        `Run must be in REVIEWED status to submit`,
      );
    }

    const flagged = await this.prisma.payrollEntry.groupBy({
      by: ['flag'],
      where: { runId, flag: { not: 'NONE' } },
      _count: { _all: true },
    });

    if (flagged.length > 0 && !options?.acknowledgeFlags) {
      const flagCounts: Record<string, number> = {};
      for (const row of flagged) {
        flagCounts[row.flag] = row._count._all;
      }
      throw new BadRequestException({
        message:
          'Run has flagged entries; set acknowledgeFlags=true to submit anyway',
        flagCounts,
      });
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        submittedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    const hrManagers = await this.findUserIdsByRoleNames(ctx.companyId, [
      HR_MANAGER_ROLE,
    ]);
    await this.notifyMany(
      ctx,
      hrManagers,
      'payroll.run_submitted',
      `Payroll ${run.runNumber} submitted`,
      `Payroll run ${run.runNumber} (${run.month}/${run.year}) was submitted for approval.`,
      `/payroll/runs/${runId}`,
    );

    return updated;
  }

  /**
   * HR Manager / System Administrator: SUBMITTED → APPROVED.
   */
  async approveRun(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    await this.assertHasAnyRole(ctx, APPROVE_ROLES);
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Run must be in SUBMITTED status to approve`,
      );
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    const gms = await this.findUserIdsByRoleNames(ctx.companyId, [
      GENERAL_MANAGER_ROLE,
    ]);
    await this.notifyMany(
      ctx,
      gms,
      'payroll.run_approved',
      `Payroll ${run.runNumber} approved by HR`,
      `Payroll run ${run.runNumber} (${run.month}/${run.year}) was approved by HR and awaits GM approval.`,
      `/payroll/runs/${runId}`,
    );

    return updated;
  }

  /**
   * General Manager / System Administrator: APPROVED → GM_APPROVED.
   */
  async gmApproveRun(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    await this.assertHasAnyRole(ctx, GM_APPROVE_ROLES);
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status !== 'APPROVED') {
      throw new BadRequestException(
        `Run must be in APPROVED status for GM approval`,
      );
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'GM_APPROVED',
        gmApprovedAt: new Date(),
        gmApprovedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    const recipients = new Set<string>([run.createdBy]);
    const localHr = await this.findUserIdsByRoleNames(ctx.companyId, [
      LOCAL_HR_MANAGER_ROLE,
    ]);
    for (const id of localHr) {
      recipients.add(id);
    }

    await this.notifyMany(
      ctx,
      [...recipients],
      'payroll.run_gm_approved',
      `Payroll ${run.runNumber} GM approved`,
      `Payroll run ${run.runNumber} (${run.month}/${run.year}) was approved by the General Manager.`,
      `/payroll/runs/${runId}`,
    );

    return updated;
  }

  /**
   * Marks a GM_APPROVED run as PAID.
   */
  async markPaid(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status !== 'GM_APPROVED') {
      throw new BadRequestException(
        `Run must be GM_APPROVED before marking as paid`,
      );
    }

    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paidBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  /**
   * Cancels a run that is not yet GM_APPROVED or PAID (no soft-delete).
   */
  async cancelRun(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status === 'GM_APPROVED' || run.status === 'PAID') {
      throw new BadRequestException(
        `Cannot cancel a run in ${run.status} status`,
      );
    }

    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'CANCELLED',
        updatedBy: ctx.userId,
      },
    });
  }

  /**
   * Updates bonus / net top-ups and notes on an entry in a DRAFT or REVIEWED run.
   */
  async updateEntry(
    entryId: string,
    dto: {
      bonusTopUp?: number;
      bonusTopUpReason?: string;
      netTopUp?: number;
      netTopUpReason?: string;
      notes?: string;
    },
    ctx: ServiceContext,
  ): Promise<PayrollEntry> {
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { id: entryId, companyId: ctx.companyId },
      include: { run: true },
    });
    if (!entry) {
      throw new NotFoundException('Payroll entry not found');
    }
    if (entry.run.status !== 'DRAFT' && entry.run.status !== 'REVIEWED') {
      throw new BadRequestException(
        `Cannot edit entry in run status: ${entry.run.status}`,
      );
    }

    const bonusTopUp = dto.bonusTopUp ?? this.toNumber(entry.bonusTopUp);
    if (bonusTopUp < 0) {
      throw new BadRequestException('bonusTopUp must be >= 0');
    }
    if (bonusTopUp !== 0) {
      const reason = dto.bonusTopUpReason ?? entry.bonusTopUpReason;
      if (!reason || reason.trim().length === 0) {
        throw new BadRequestException(
          'bonusTopUpReason is required when bonusTopUp is not zero',
        );
      }
    }

    const netTopUp = dto.netTopUp ?? this.toNumber(entry.netTopUp);
    if (netTopUp < 0) {
      throw new BadRequestException('netTopUp must be >= 0');
    }
    if (netTopUp !== 0) {
      const reason = dto.netTopUpReason ?? entry.netTopUpReason;
      if (!reason || reason.trim().length === 0) {
        throw new BadRequestException(
          'netTopUpReason is required when netTopUp is not zero',
        );
      }
    }

    const result = await this.recalcEntryAmounts(entry, entry.run, {
      bonusTopUp,
      netTopUp,
    });

    const updated = await this.prisma.payrollEntry.update({
      where: { id: entryId },
      data: {
        bonusTopUp: new Decimal(bonusTopUp),
        bonusTopUpReason:
          dto.bonusTopUpReason !== undefined
            ? dto.bonusTopUpReason
            : entry.bonusTopUpReason,
        netTopUp: new Decimal(netTopUp),
        netTopUpReason:
          dto.netTopUpReason !== undefined
            ? dto.netTopUpReason
            : entry.netTopUpReason,
        notes: dto.notes !== undefined ? dto.notes : entry.notes,
        ...this.calculationToEntryUpdate(result),
        updatedBy: ctx.userId,
      },
    });

    await this.updateRunTotals(entry.runId, ctx);
    return updated;
  }

  // ── Bulk generation internals ───────────────────────────────────────────

  private async buildEntryDrafts(
    run: PayrollRun,
    ctx: ServiceContext,
    capturedTopUps: Map<string, CapturedTopUp>,
  ): Promise<EntryDraft[]> {
    const { month, year } = run;
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));

    const employees = await this.prisma.user.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        includeInPayroll: true,
        deletedAt: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        employeeType: true,
        bankName: true,
        bankAccountNumber: true,
      },
    });

    if (employees.length === 0) {
      return [];
    }

    const employeeIds = employees.map((e) => e.id);

    const [contracts, attendanceRecords, overtimeSheets, siteAssignments] =
      await Promise.all([
      this.prisma.employeeContract.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId: { in: employeeIds },
          deletedAt: null,
          startDate: { lte: monthEnd },
          AND: [
            {
              OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
            },
            {
              OR: [
                { status: 'ACTIVE' },
                {
                  status: { in: ['SUPERSEDED', 'TERMINATED', 'EXPIRED'] },
                  endDate: {
                    gte: monthStart,
                    lte: monthEnd,
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          employeeId: true,
          startDate: true,
          endDate: true,
          status: true,
          basicSalary: true,
          transportationAllowance: true,
          monthlyBonus: true,
          monthlyNetBonus: true,
          pensionApplicable: true,
          taxApplicable: true,
        },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId: { in: employeeIds },
          month,
          year,
        },
        select: {
          id: true,
          employeeId: true,
          scheduledDays: true,
          presentDays: true,
          absentDays: true,
          paidDays: true,
        },
      }),
      this.prisma.overtimeSheet.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId: { in: employeeIds },
          month,
          year,
          status: 'APPROVED',
        },
        select: {
          id: true,
          employeeId: true,
          totalRegularHours: true,
          totalNightHours: true,
          totalWeekendHours: true,
          totalHolidayHours: true,
        },
      }),
      this.prisma.siteAssignment.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          deletedAt: null,
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
        select: {
          employeeId: true,
          siteName: true,
          startDate: true,
          endDate: true,
        },
      }),
    ]);

    const contractsByEmployee = new Map<string, ContractSnapshot[]>();
    for (const contract of contracts) {
      const list = contractsByEmployee.get(contract.employeeId) ?? [];
      list.push(contract);
      contractsByEmployee.set(contract.employeeId, list);
    }

    const attendanceByEmployee = new Map<string, AttendanceSnapshot>();
    for (const record of attendanceRecords) {
      attendanceByEmployee.set(record.employeeId, record);
    }

    const overtimeByEmployee = new Map<string, OvertimeSnapshot>();
    for (const sheet of overtimeSheets) {
      overtimeByEmployee.set(sheet.employeeId, sheet);
    }

    const siteByEmployee = new Map<
      string,
      Array<{ siteName: string; startDate: Date; endDate: Date }>
    >();
    for (const row of siteAssignments) {
      const list = siteByEmployee.get(row.employeeId) ?? [];
      list.push({
        siteName: row.siteName,
        startDate: row.startDate,
        endDate: row.endDate,
      });
      siteByEmployee.set(row.employeeId, list);
    }

    const taxableThreshold = this.toNumber(run.taxableThreshold);
    const drafts: EntryDraft[] = [];

    for (const employee of employees) {
      const overlapping = contractsByEmployee.get(employee.id) ?? [];
      const attendance = attendanceByEmployee.get(employee.id);

      if (overlapping.length === 0 && !attendance) {
        continue;
      }

      const topUp = capturedTopUps.get(employee.id);
      drafts.push(
        this.computeEntryDraft({
          run,
          ctx,
          employee,
          contracts: overlapping,
          attendance,
          overtime: overtimeByEmployee.get(employee.id),
          siteAssignments: siteByEmployee.get(employee.id) ?? [],
          taxableThreshold,
          bonusTopUp: topUp?.bonusTopUp ?? 0,
          bonusTopUpReason: topUp?.bonusTopUpReason ?? null,
          netTopUp: topUp?.netTopUp ?? 0,
          netTopUpReason: topUp?.netTopUpReason ?? null,
          preservedNotes: topUp?.notes ?? null,
        }),
      );
    }

    return drafts;
  }

  private computeEntryDraft(input: {
    run: PayrollRun;
    ctx: ServiceContext;
    employee: EmployeeSnapshot;
    contracts: ContractSnapshot[];
    attendance: AttendanceSnapshot | undefined;
    overtime: OvertimeSnapshot | undefined;
    siteAssignments: Array<{
      siteName: string;
      startDate: Date;
      endDate: Date;
    }>;
    taxableThreshold: number;
    bonusTopUp: number;
    bonusTopUpReason: string | null;
    netTopUp: number;
    netTopUpReason: string | null;
    preservedNotes: string | null;
  }): EntryDraft {
    const {
      run,
      ctx,
      employee,
      contracts,
      attendance,
      overtime,
      siteAssignments,
      taxableThreshold,
      bonusTopUp,
      bonusTopUpReason,
      netTopUp,
      netTopUpReason,
      preservedNotes,
    } = input;

    const monthStart = new Date(Date.UTC(run.year, run.month - 1, 1));
    const monthEnd = new Date(Date.UTC(run.year, run.month, 0));

    const sorted = [...contracts].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime(),
    );

    const periodDetails: Array<{
      contract: ContractSnapshot;
      days: number;
      window: DateWindow | null;
      periodEarned: number;
    }> = [];

    let totalEmployedDays = 0;
    const windows: DateWindow[] = [];

    for (const contract of sorted) {
      const employed = employedPayrollDays(
        run.month,
        run.year,
        contract.startDate,
        contract.endDate,
      );
      const window = employedCalendarWindow(
        run.month,
        run.year,
        contract.startDate,
        contract.endDate,
      );
      const basic = this.toNumber(contract.basicSalary);
      const periodEarned =
        employed.days > 0 ? this.round((basic / 30) * employed.days) : 0;

      if (employed.days > 0) {
        totalEmployedDays += employed.days;
        periodDetails.push({
          contract,
          days: employed.days,
          window,
          periodEarned,
        });
      }
      if (window) {
        windows.push(window);
      }
    }

    let absentInWindow = 0;
    let payrollDays = totalEmployedDays;
    const noteParts: string[] = [];

    if (attendance) {
      absentInWindow = this.toNumber(attendance.absentDays);
      payrollDays = this.toNumber(attendance.paidDays);
    }

    for (const assignment of siteAssignments) {
      const rangeStart = new Date(
        Math.max(assignment.startDate.getTime(), monthStart.getTime()),
      );
      const rangeEnd = new Date(
        Math.min(assignment.endDate.getTime(), monthEnd.getTime()),
      );
      if (rangeStart.getTime() > rangeEnd.getTime()) {
        continue;
      }
      const msPerDay = 24 * 60 * 60 * 1000;
      const days =
        Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / msPerDay) + 1;
      noteParts.push(`${days} day(s) on site at ${assignment.siteName}`);
    }
    // Absences reduce earned pay; scale multi-contract period earneds.
    const earnedScale =
      totalEmployedDays > 0 ? payrollDays / totalEmployedDays : 0;
    const sumEarned = this.round(
      periodDetails.reduce(
        (sum, p) => sum + p.periodEarned * earnedScale,
        0,
      ),
    );

    const monthEndContract =
      sorted.length > 0 ? sorted[sorted.length - 1] : undefined;
    const monthEndBasic = this.toNumber(monthEndContract?.basicSalary);
    const transport = this.toNumber(monthEndContract?.transportationAllowance);
    const monthlyBonus = this.toNumber(monthEndContract?.monthlyBonus);
    const contractNetBonus = this.toNumber(monthEndContract?.monthlyNetBonus);
    const pensionApplicable = monthEndContract?.pensionApplicable ?? true;
    const taxApplicable = monthEndContract?.taxApplicable ?? true;

    let flag: PayrollEntryFlag = 'NONE';
    let flagNote: string | undefined;
    if (sorted.length === 0 && attendance) {
      flag = 'MISSING_CONTRACT';
      flagNote = 'No overlapping contract found for this month';
    } else if (sorted.length > 0 && !attendance) {
      flag = 'MISSING_ATTENDANCE';
      flagNote = 'No attendance record found for this month';
    } else if (monthEndBasic === 0) {
      flag = 'ZERO_SALARY';
      flagNote = 'Basic salary is zero on month-end contract';
    }

    const overtimeHours: OvertimeHours = {
      normalHours: this.toNumber(overtime?.totalRegularHours),
      eveningHours: this.toNumber(overtime?.totalNightHours),
      sundayHours: this.toNumber(overtime?.totalWeekendHours),
      holidayHours: this.toNumber(overtime?.totalHolidayHours),
    };

    const result = this.calc.calculate({
      basicSalary: monthEndBasic,
      transportAllowance: transport,
      monthlyBonus,
      bonusTopUp,
      contractNetBonus,
      netTopUp,
      payrollDays,
      earnedSalary: sumEarned,
      overtimeHours,
      taxableThreshold,
      pensionApplicable,
      taxApplicable,
    });

    const entryId = randomUUID();
    const notesFromGenerate = noteParts.length > 0 ? noteParts.join('. ') : null;
    const notes = preservedNotes ?? notesFromGenerate;

    const salaryPeriods: SalaryPeriodDraft[] = [];
    if (periodDetails.length > 1) {
      for (const period of periodDetails) {
        const window = period.window;
        if (!window) {
          continue;
        }
        salaryPeriods.push({
          id: randomUUID(),
          entryId,
          contractId: period.contract.id,
          periodStart: window.windowStart,
          periodEnd: window.windowEnd,
          days: this.round(period.days * earnedScale),
          basicSalary: this.toNumber(period.contract.basicSalary),
          earnedSalary: this.round(period.periodEarned * earnedScale),
        });
      }
    }

    const entry: Prisma.PayrollEntryCreateManyInput = {
      id: entryId,
      companyId: ctx.companyId,
      runId: run.id,
      employeeId: employee.id,
      contractId: monthEndContract?.id ?? null,
      attendanceRecordId: attendance?.id ?? null,
      overtimeSheetId: overtime?.id ?? null,
      scheduledDays: new Decimal(
        attendance ? this.toNumber(attendance.scheduledDays) : 0,
      ),
      presentDays: new Decimal(
        attendance ? this.toNumber(attendance.presentDays) : 0,
      ),
      absentDays: new Decimal(absentInWindow),
      employedDays: new Decimal(totalEmployedDays),
      payrollDays: new Decimal(result.payrollDays),
      basicSalary: new Decimal(monthEndBasic),
      transportAllowance: new Decimal(transport),
      monthlyBonus: new Decimal(monthlyBonus),
      contractNetBonus: new Decimal(contractNetBonus),
      earnedSalary: new Decimal(result.earnedSalary),
      normalOtHours: new Decimal(overtimeHours.normalHours),
      eveningOtHours: new Decimal(overtimeHours.eveningHours),
      sundayOtHours: new Decimal(overtimeHours.sundayHours),
      holidayOtHours: new Decimal(overtimeHours.holidayHours),
      normalOtPay: new Decimal(result.normalOtPay),
      eveningOtPay: new Decimal(result.eveningOtPay),
      sundayOtPay: new Decimal(result.sundayOtPay),
      holidayOtPay: new Decimal(result.holidayOtPay),
      totalOtPay: new Decimal(result.totalOtPay),
      taxableTransport: new Decimal(result.taxableTransport),
      nonTaxableTransport: new Decimal(result.nonTaxableTransport),
      grossIncome: new Decimal(result.grossIncome),
      taxableIncome: new Decimal(result.taxableIncome),
      pensionEmployee: new Decimal(result.pensionEmployee),
      pensionEmployer: new Decimal(result.pensionEmployer),
      incomeTax: new Decimal(result.incomeTax),
      totalDeductions: new Decimal(result.totalDeductions),
      netPay: new Decimal(result.netPay),
      bonusTopUp: new Decimal(bonusTopUp),
      bonusTopUpReason,
      netTopUp: new Decimal(netTopUp),
      netTopUpReason,
      flag,
      flagNote: flagNote ?? null,
      bankName: employee.bankName,
      bankAccountNumber: employee.bankAccountNumber,
      employeeCategory: employee.employeeType,
      notes,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    };

    return { entry, salaryPeriods };
  }

  private async persistEntryDrafts(
    drafts: EntryDraft[],
    ctx: ServiceContext,
  ): Promise<void> {
    if (drafts.length === 0) {
      return;
    }

    for (let i = 0; i < drafts.length; i += ENTRY_WRITE_CHUNK) {
      const chunk = drafts.slice(i, i + ENTRY_WRITE_CHUNK);
      await this.prisma.payrollEntry.createMany({
        data: chunk.map((d) => d.entry),
      });

      const periods = chunk.flatMap((d) => d.salaryPeriods);
      if (periods.length > 0) {
        await this.prisma.payrollSalaryPeriod.createMany({
          data: periods.map((p) => ({
            id: p.id,
            entryId: p.entryId,
            contractId: p.contractId,
            periodStart: p.periodStart,
            periodEnd: p.periodEnd,
            days: new Decimal(p.days),
            basicSalary: new Decimal(p.basicSalary),
            earnedSalary: new Decimal(p.earnedSalary),
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })),
        });
      }
    }
  }

  private async recalcEntryAmounts(
    entry: PayrollEntry,
    run: Pick<PayrollRun, 'taxableThreshold'>,
    topUps: { bonusTopUp: number; netTopUp: number },
  ): Promise<PayrollCalculationResult> {
    let pensionApplicable = true;
    let taxApplicable = true;
    if (entry.contractId) {
      const contract = await this.prisma.employeeContract.findFirst({
        where: { id: entry.contractId, deletedAt: null },
        select: { pensionApplicable: true, taxApplicable: true },
      });
      if (contract) {
        pensionApplicable = contract.pensionApplicable;
        taxApplicable = contract.taxApplicable;
      }
    }

    return this.calc.calculate({
      basicSalary: this.toNumber(entry.basicSalary),
      transportAllowance: this.toNumber(entry.transportAllowance),
      monthlyBonus: this.toNumber(entry.monthlyBonus),
      bonusTopUp: topUps.bonusTopUp,
      contractNetBonus: this.toNumber(entry.contractNetBonus),
      netTopUp: topUps.netTopUp,
      payrollDays: this.toNumber(entry.payrollDays),
      earnedSalary: this.toNumber(entry.earnedSalary),
      overtimeHours: {
        normalHours: this.toNumber(entry.normalOtHours),
        eveningHours: this.toNumber(entry.eveningOtHours),
        sundayHours: this.toNumber(entry.sundayOtHours),
        holidayHours: this.toNumber(entry.holidayOtHours),
      },
      taxableThreshold: this.toNumber(run.taxableThreshold),
      pensionApplicable,
      taxApplicable,
    });
  }

  private calculationToEntryUpdate(
    result: PayrollCalculationResult,
  ): Prisma.PayrollEntryUncheckedUpdateInput {
    return {
      payrollDays: new Decimal(result.payrollDays),
      earnedSalary: new Decimal(result.earnedSalary),
      normalOtPay: new Decimal(result.normalOtPay),
      eveningOtPay: new Decimal(result.eveningOtPay),
      sundayOtPay: new Decimal(result.sundayOtPay),
      holidayOtPay: new Decimal(result.holidayOtPay),
      totalOtPay: new Decimal(result.totalOtPay),
      taxableTransport: new Decimal(result.taxableTransport),
      nonTaxableTransport: new Decimal(result.nonTaxableTransport),
      grossIncome: new Decimal(result.grossIncome),
      taxableIncome: new Decimal(result.taxableIncome),
      pensionEmployee: new Decimal(result.pensionEmployee),
      pensionEmployer: new Decimal(result.pensionEmployer),
      incomeTax: new Decimal(result.incomeTax),
      totalDeductions: new Decimal(result.totalDeductions),
      netPay: new Decimal(result.netPay),
    };
  }

  private async updateRunTotals(
    runId: string,
    ctx: ServiceContext,
  ): Promise<void> {
    const entries = await this.prisma.payrollEntry.findMany({
      where: { runId },
      select: {
        grossIncome: true,
        netPay: true,
        contractNetBonus: true,
        netTopUp: true,
        pensionEmployee: true,
        pensionEmployer: true,
        incomeTax: true,
      },
    });

    const totals = entries.reduce(
      (acc, e) => ({
        totalGross: acc.totalGross + this.toNumber(e.grossIncome),
        totalNetPay: acc.totalNetPay + this.toNumber(e.netPay),
        totalNetBonus:
          acc.totalNetBonus +
          this.toNumber(e.contractNetBonus) +
          this.toNumber(e.netTopUp),
        totalPensionEmp: acc.totalPensionEmp + this.toNumber(e.pensionEmployee),
        totalPensionEmr: acc.totalPensionEmr + this.toNumber(e.pensionEmployer),
        totalTax: acc.totalTax + this.toNumber(e.incomeTax),
      }),
      {
        totalGross: 0,
        totalNetPay: 0,
        totalNetBonus: 0,
        totalPensionEmp: 0,
        totalPensionEmr: 0,
        totalTax: 0,
      },
    );

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        totalEmployees: entries.length,
        totalGross: new Decimal(this.round(totals.totalGross)),
        totalNetPay: new Decimal(this.round(totals.totalNetPay)),
        totalNetBonus: new Decimal(this.round(totals.totalNetBonus)),
        totalPensionEmp: new Decimal(this.round(totals.totalPensionEmp)),
        totalPensionEmr: new Decimal(this.round(totals.totalPensionEmr)),
        totalTax: new Decimal(this.round(totals.totalTax)),
        updatedBy: ctx.userId,
      },
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private generateRunNumber(month: number, year: number): string {
    const m = String(month).padStart(2, '0');
    return `PR-${year}-${m}`;
  }

  private toNumber(value: Decimal | number | null | undefined): number {
    if (value == null) {
      return 0;
    }
    return Number(value);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private maskBankAccount(account: string | null): string | null {
    if (!account) {
      return account;
    }
    const digits = account.replace(/\s+/g, '');
    if (digits.length <= 4) {
      return `••••${digits}`;
    }
    return `••••${digits.slice(-4)}`;
  }

  private async requireRun(
    runId: string,
    companyId: string,
  ): Promise<PayrollRun> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId, deletedAt: null },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    return run;
  }

  private async assertHasAnyRole(
    ctx: ServiceContext,
    roleNames: readonly string[],
  ): Promise<void> {
    const match = await this.prisma.userRole.findFirst({
      where: {
        userId: ctx.userId,
        deletedAt: null,
        role: {
          companyId: ctx.companyId,
          deletedAt: null,
          name: { in: [...roleNames] },
        },
      },
      select: { id: true },
    });
    if (!match) {
      throw new ForbiddenException(
        `Requires one of: ${roleNames.join(', ')}`,
      );
    }
  }

  private async findUserIdsByRoleNames(
    companyId: string,
    roleNames: readonly string[],
  ): Promise<string[]> {
    const assignments = await this.prisma.userRole.findMany({
      where: {
        deletedAt: null,
        role: {
          companyId,
          deletedAt: null,
          name: { in: [...roleNames] },
        },
        user: {
          companyId,
          isActive: true,
          deletedAt: null,
        },
      },
      select: { userId: true },
    });
    return [...new Set(assignments.map((a) => a.userId))];
  }

  /**
   * Sends notifications without failing the payroll workflow.
   */
  private async notifyMany(
    ctx: ServiceContext,
    recipientIds: string[],
    eventType: string,
    subject: string,
    body: string,
    link: string,
  ): Promise<void> {
    for (const recipientId of recipientIds) {
      try {
        await this.notifications.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId,
            eventType,
            channel: 'IN_APP',
            subject,
            body,
            link,
          },
        );
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to send ${eventType} to ${recipientId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
