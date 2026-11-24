import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PayrollOtCategory } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { loadPolicySnapshot } from '../../../../shared/policy/policy-reader.util';
import { AuditService } from '../../../audit/application/services/audit.service';
import type {
  ReplacePayrollOtAdjustmentsDto,
  UpsertPayrollOtAdjustmentDto,
} from '../dtos/payroll.dtos';
import {
  combineManualOvertimeByContracts,
  manualOtHourlyRate,
  OT_CATEGORY_KEYS,
  PAYROLL_OT_CATEGORIES,
  systemOvertimeFromEntry,
  type ContractManualOtGroup,
  type ManualOtAdjustmentInput,
} from '../utils/payroll-ot-adjustment.util';
import type {
  OvertimeHoursBuckets,
  OvertimePayAmounts,
} from '../utils/payroll-overtime.util';
import { PayrollRunService } from './payroll-run.service';

interface ServiceContext {
  userId: string;
  companyId: string;
}

/** Runs whose entries HR can still change (same rule as other entry edits). */
const EDITABLE_STATUSES = new Set(['DRAFT', 'REVIEWED']);

const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

const adjustmentInclude = {
  creator: { select: personSelect },
  updater: { select: personSelect },
  employee: { select: { ...personSelect, employeeId: true } },
  contract: { select: { id: true, contractNumber: true } },
} satisfies Prisma.PayrollOtAdjustmentInclude;

const periodInclude = {
  contract: { select: { id: true, contractNumber: true } },
} satisfies Prisma.PayrollSalaryPeriodInclude;

type AdjustmentRow = Prisma.PayrollOtAdjustmentGetPayload<{
  include: typeof adjustmentInclude;
}>;

type PeriodRow = Prisma.PayrollSalaryPeriodGetPayload<{
  include: typeof periodInclude;
}>;

type EntryWithPeriods = Prisma.PayrollEntryGetPayload<{
  include: { salaryPeriods: { include: typeof periodInclude } };
}>;

export interface PayrollOtAdjustmentView {
  id: string;
  payrollRunId: string;
  employeeId: string;
  contractId: string;
  employee: { id: string; firstName: string; lastName: string; employeeId: string | null };
  otCategory: PayrollOtCategory;
  hours: number;
  appliedHours: number;
  amount: number;
  note: string | null;
  createdBy: { id: string; firstName: string; lastName: string };
  createdAt: Date;
  updatedBy: { id: string; firstName: string; lastName: string };
  updatedAt: Date;
}

export interface PayrollOtCategoryBreakdown {
  category: PayrollOtCategory;
  systemHours: number;
  systemPay: number;
  manualHours: number;
  manualPay: number;
  totalHours: number;
  totalPay: number;
}

/** One salary-period contract HR can assign paper OT to. */
export interface PayrollOtContractOption {
  contractId: string;
  contractNumber: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  basicSalary: number;
  categories: PayrollOtCategoryBreakdown[];
  rates: Record<PayrollOtCategory, number>;
}

/** System vs manual OT for one employee on one run. */
export interface PayrollOtBreakdown {
  runId: string;
  runStatus: string;
  editable: boolean;
  employeeId: string;
  entryId: string | null;
  /** Approved overtime sheet behind the system OT, for "View dates". */
  overtimeSheetId: string | null;
  paidDays: number;
  /** Default contract for the UI picker (month-end / last period). */
  defaultContractId: string | null;
  contracts: PayrollOtContractOption[];
  /** Employee-level roll-up (all contracts). */
  categories: PayrollOtCategoryBreakdown[];
  totals: { systemPay: number; manualPay: number; totalPay: number };
  adjustments: PayrollOtAdjustmentView[];
  /**
   * Rates for the default contract (kept for older clients / live preview
   * when no contract is selected yet).
   */
  rates: Record<PayrollOtCategory, number>;
  /** After a change: the repriced entry, so the client can patch it in place. */
  entry?: Prisma.PayrollEntryGetPayload<object>;
}

type Policy = Awaited<ReturnType<typeof loadPolicySnapshot>>;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function num(value: Decimal | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function emptyHours(): OvertimeHoursBuckets {
  return { normalHours: 0, eveningHours: 0, sundayHours: 0, holidayHours: 0 };
}

function emptyPay(): Omit<OvertimePayAmounts, 'totalOtPay'> {
  return { normalOtPay: 0, eveningOtPay: 0, sundayOtPay: 0, holidayOtPay: 0 };
}

function isoDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/**
 * Manual OT adjustments for paper-based overtime on a payroll run.
 * Each change reprices the employee's entry: system OT is recovered per
 * salary-period contract, then that contract's paper hours are priced on its
 * basic and added on top (see payroll-ot-adjustment.util).
 */
@Injectable()
export class PayrollOtAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payrollRunService: PayrollRunService,
  ) {}

  /** All adjustments on a run (optionally one employee), for history views. */
  async list(
    runId: string,
    companyId: string,
    employeeId?: string,
  ): Promise<PayrollOtAdjustmentView[]> {
    await this.loadRun(runId, companyId);
    const rows = await this.prisma.payrollOtAdjustment.findMany({
      where: {
        companyId,
        payrollRunId: runId,
        ...(employeeId ? { employeeId } : {}),
      },
      include: adjustmentInclude,
      orderBy: [{ employeeId: 'asc' }, { contractId: 'asc' }, { otCategory: 'asc' }],
    });
    return rows.map((row) => this.toView(row));
  }

  /** System OT, manual OT and combined totals per category for one employee. */
  async breakdown(
    runId: string,
    employeeId: string,
    companyId: string,
  ): Promise<PayrollOtBreakdown> {
    const run = await this.loadRun(runId, companyId);
    const entry = await this.loadEntryWithPeriods(runId, employeeId, companyId);
    const [rows, policy] = await Promise.all([
      this.prisma.payrollOtAdjustment.findMany({
        where: { companyId, payrollRunId: runId, employeeId },
        include: adjustmentInclude,
        orderBy: [{ contractId: 'asc' }, { otCategory: 'asc' }],
      }),
      this.loadPolicy(run),
    ]);
    return this.buildBreakdown(run, employeeId, entry, rows, policy);
  }

  /** Breakdown right after a save, from what the save already has in hand. */
  private async breakdownAfterSave(
    run: Prisma.PayrollRunGetPayload<object>,
    employeeId: string,
    saved: { entry: Prisma.PayrollEntryGetPayload<object>; policy: Policy },
    audit: Promise<unknown>,
  ): Promise<PayrollOtBreakdown> {
    const [rows, entry] = await Promise.all([
      this.prisma.payrollOtAdjustment.findMany({
        where: { companyId: run.companyId, payrollRunId: run.id, employeeId },
        include: adjustmentInclude,
        orderBy: [{ contractId: 'asc' }, { otCategory: 'asc' }],
      }),
      this.loadEntryWithPeriods(run.id, employeeId, run.companyId),
      audit,
    ]);
    return {
      ...this.buildBreakdown(
        run,
        employeeId,
        entry ?? { ...saved.entry, salaryPeriods: [] },
        rows,
        saved.policy,
      ),
      entry: saved.entry,
    };
  }

  private loadPolicy(run: Prisma.PayrollRunGetPayload<object>): Promise<Policy> {
    return loadPolicySnapshot(
      this.prisma,
      run.companyId,
      new Date(Date.UTC(run.year, run.month - 1, 1)),
    );
  }

  /** Creates or updates the adjustment for (employee, contract, category). */
  async upsert(
    runId: string,
    dto: UpsertPayrollOtAdjustmentDto,
    ctx: ServiceContext,
  ): Promise<PayrollOtBreakdown> {
    const note = dto.note?.trim() || null;
    if (!note) {
      throw new BadRequestException(
        'A note is required: say where these hours come from (e.g. "Paper records - Nov 2026")',
      );
    }
    const hours = round2(dto.hours);
    if (hours === 0) {
      throw new BadRequestException('Hours cannot be zero. Delete the adjustment instead');
    }

    const { run, entry, existing, periods } = await this.loadEditable(
      runId,
      dto.employeeId,
      ctx,
    );
    this.assertKnownContract(dto.contractId, entry, periods);

    const previous =
      existing.find(
        (row) =>
          row.contractId === dto.contractId && row.otCategory === dto.otCategory,
      ) ?? null;

    const nextRows = [
      ...existing.filter(
        (row) =>
          !(row.contractId === dto.contractId && row.otCategory === dto.otCategory),
      ),
      {
        contractId: dto.contractId,
        otCategory: dto.otCategory,
        hours: new Decimal(hours),
        appliedHours: new Decimal(0),
        amount: new Decimal(0),
        note,
      },
    ];

    const groups = this.buildGroups(entry, periods, existing, nextRows);
    const targetGroup = groups.find((g) => g.contractId === dto.contractId);
    if (targetGroup) {
      const keys = OT_CATEGORY_KEYS[dto.otCategory];
      if (targetGroup.systemHours[keys.hours] + hours < 0) {
        throw new BadRequestException(
          `This would take ${dto.otCategory.toLowerCase()} OT below zero on this contract: the system has ${targetGroup.systemHours[keys.hours]} hours`,
        );
      }
    }

    const saved = await this.applyAndSave(run, entry, periods, groups, ctx, async (tx, appliedByContract) => {
      const applied =
        appliedByContract
          .find((g) => g.contractId === dto.contractId)
          ?.applied.find((row) => row.category === dto.otCategory) ?? {
          category: dto.otCategory,
          hours: 0,
          amount: 0,
        };
      return tx.payrollOtAdjustment.upsert({
        where: {
          payrollRunId_employeeId_contractId_otCategory: {
            payrollRunId: runId,
            employeeId: dto.employeeId,
            contractId: dto.contractId,
            otCategory: dto.otCategory,
          },
        },
        create: {
          companyId: ctx.companyId,
          payrollRunId: runId,
          employeeId: dto.employeeId,
          contractId: dto.contractId,
          otCategory: dto.otCategory,
          hours: new Decimal(hours),
          appliedHours: new Decimal(applied.hours),
          amount: new Decimal(applied.amount),
          note,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
        update: {
          hours: new Decimal(hours),
          appliedHours: new Decimal(applied.hours),
          amount: new Decimal(applied.amount),
          note,
          updatedBy: ctx.userId,
        },
      });
    });

    const audit = this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'payroll',
        action: previous ? 'ot_adjustment_updated' : 'ot_adjustment_created',
        recordType: 'PayrollOtAdjustment',
        recordId: saved.written?.id ?? previous?.id ?? '',
        recordReference: run.runNumber,
        beforeValue: previous
          ? {
              employeeId: dto.employeeId,
              contractId: dto.contractId,
              otCategory: dto.otCategory,
              hours: num(previous.hours),
              note: previous.note,
            }
          : undefined,
        afterValue: {
          employeeId: dto.employeeId,
          contractId: dto.contractId,
          otCategory: dto.otCategory,
          hours,
          note,
        },
      }),
    );

    return this.breakdownAfterSave(run, dto.employeeId, saved, audit);
  }

  /**
   * Replaces manual OT for one contract on an employee in a single reprice.
   * Other contracts are left untouched. Empty `items` clears that contract.
   */
  async replaceForEmployee(
    runId: string,
    dto: ReplacePayrollOtAdjustmentsDto,
    ctx: ServiceContext,
  ): Promise<PayrollOtBreakdown> {
    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.otCategory)) {
        throw new BadRequestException(
          `Duplicate OT category in items: ${item.otCategory}`,
        );
      }
      seen.add(item.otCategory);
    }

    const note = dto.note?.trim() || null;
    if (dto.items.length > 0 && !note) {
      throw new BadRequestException(
        'A note is required: say where these hours come from (e.g. "Paper records - Nov 2026")',
      );
    }

    const nextForContract: ManualOtAdjustmentInput[] = dto.items.map((item) => ({
      category: item.otCategory,
      hours: round2(item.hours),
    }));
    if (nextForContract.some((row) => row.hours === 0)) {
      throw new BadRequestException(
        'Hours cannot be zero. Omit the category instead',
      );
    }

    const { run, entry, existing, periods } = await this.loadEditable(
      runId,
      dto.employeeId,
      ctx,
    );
    this.assertKnownContract(dto.contractId, entry, periods);

    const nextRows = [
      ...existing.filter((row) => row.contractId !== dto.contractId),
      ...nextForContract.map((row) => ({
        contractId: dto.contractId,
        otCategory: row.category,
        hours: new Decimal(row.hours),
        appliedHours: new Decimal(0),
        amount: new Decimal(0),
        note,
      })),
    ];

    const groups = this.buildGroups(entry, periods, existing, nextRows);
    const targetGroup = groups.find((g) => g.contractId === dto.contractId);
    if (targetGroup) {
      for (const row of nextForContract) {
        const keys = OT_CATEGORY_KEYS[row.category];
        if (targetGroup.systemHours[keys.hours] + row.hours < 0) {
          throw new BadRequestException(
            `This would take ${row.category.toLowerCase()} OT below zero on this contract: the system has ${targetGroup.systemHours[keys.hours]} hours`,
          );
        }
      }
    }

    const before = existing
      .filter((row) => row.contractId === dto.contractId)
      .map((row) => ({
        otCategory: row.otCategory,
        hours: num(row.hours),
        note: row.note,
      }));

    const saved = await this.applyAndSave(
      run,
      entry,
      periods,
      groups,
      ctx,
      async (tx, appliedByContract) => {
        await tx.payrollOtAdjustment.deleteMany({
          where: {
            companyId: ctx.companyId,
            payrollRunId: runId,
            employeeId: dto.employeeId,
            contractId: dto.contractId,
          },
        });
        if (nextForContract.length === 0) {
          return null;
        }
        const applied =
          appliedByContract.find((g) => g.contractId === dto.contractId)?.applied ??
          [];
        await tx.payrollOtAdjustment.createMany({
          data: nextForContract.map((row) => {
            const mine = applied.find((item) => item.category === row.category)!;
            return {
              companyId: ctx.companyId,
              payrollRunId: runId,
              employeeId: dto.employeeId,
              contractId: dto.contractId,
              otCategory: row.category,
              hours: new Decimal(row.hours),
              appliedHours: new Decimal(mine.hours),
              amount: new Decimal(mine.amount),
              note,
              createdBy: ctx.userId,
              updatedBy: ctx.userId,
            };
          }),
        });
        return null;
      },
    );

    const audit = this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'payroll',
        action: 'ot_adjustment_replaced',
        recordType: 'PayrollOtAdjustment',
        recordId: entry.id,
        recordReference: run.runNumber,
        beforeValue: {
          employeeId: dto.employeeId,
          contractId: dto.contractId,
          adjustments: before,
        },
        afterValue: {
          employeeId: dto.employeeId,
          contractId: dto.contractId,
          note,
          adjustments: nextForContract.map((row) => ({
            otCategory: row.category,
            hours: row.hours,
          })),
        },
      }),
    );

    return this.breakdownAfterSave(run, dto.employeeId, saved, audit);
  }

  /** Removes an adjustment and reprices the entry. */
  async remove(
    runId: string,
    adjustmentId: string,
    ctx: ServiceContext,
  ): Promise<PayrollOtBreakdown> {
    const target = await this.prisma.payrollOtAdjustment.findFirst({
      where: { id: adjustmentId, payrollRunId: runId, companyId: ctx.companyId },
    });
    if (!target) {
      throw new NotFoundException('OT adjustment not found');
    }
    const { run, entry, existing, periods } = await this.loadEditable(
      runId,
      target.employeeId,
      ctx,
    );
    const nextRows = existing.filter((row) => row.id !== adjustmentId);
    const groups = this.buildGroups(entry, periods, existing, nextRows);

    const saved = await this.applyAndSave(run, entry, periods, groups, ctx, async (tx) => {
      await tx.payrollOtAdjustment.delete({ where: { id: adjustmentId } });
      return null;
    });

    const audit = this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'payroll',
        action: 'ot_adjustment_deleted',
        recordType: 'PayrollOtAdjustment',
        recordId: adjustmentId,
        recordReference: run.runNumber,
        beforeValue: {
          employeeId: target.employeeId,
          contractId: target.contractId,
          otCategory: target.otCategory,
          hours: num(target.hours),
          note: target.note,
        },
      }),
    );

    return this.breakdownAfterSave(run, target.employeeId, saved, audit);
  }

  // ── internals ──────────────────────────────────────────────────────────

  private async loadRun(
    runId: string,
    companyId: string,
  ): Promise<Prisma.PayrollRunGetPayload<object>> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId, deletedAt: null },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    return run;
  }

  private async loadEntryWithPeriods(
    runId: string,
    employeeId: string,
    companyId: string,
  ): Promise<EntryWithPeriods | null> {
    return this.prisma.payrollEntry.findFirst({
      where: { runId, employeeId, companyId },
      include: {
        salaryPeriods: {
          include: periodInclude,
          orderBy: { periodStart: 'asc' },
        },
      },
    });
  }

  private async loadEditable(
    runId: string,
    employeeId: string,
    ctx: ServiceContext,
  ) {
    const run = await this.loadRun(runId, ctx.companyId);
    if (!EDITABLE_STATUSES.has(run.status)) {
      throw new BadRequestException(
        `Cannot change OT adjustments in run status: ${run.status}`,
      );
    }
    const entry = await this.loadEntryWithPeriods(runId, employeeId, ctx.companyId);
    if (!entry) {
      throw new NotFoundException('This employee has no entry on this payroll run');
    }
    if (num(entry.payrollDays) === 0) {
      throw new BadRequestException(
        'This entry has 0 paid days, so no OT is paid this month. Fix the paid days first',
      );
    }
    const existing = await this.prisma.payrollOtAdjustment.findMany({
      where: { companyId: ctx.companyId, payrollRunId: runId, employeeId },
    });
    return { run, entry, existing, periods: entry.salaryPeriods };
  }

  private assertKnownContract(
    contractId: string,
    entry: EntryWithPeriods,
    periods: PeriodRow[],
  ): void {
    if (periods.length > 0) {
      if (!periods.some((p) => p.contractId === contractId)) {
        throw new BadRequestException(
          'That contract is not part of this employee’s salary periods on this run',
        );
      }
      return;
    }
    if (entry.contractId && entry.contractId === contractId) {
      return;
    }
    throw new BadRequestException(
      'This employee has no salary-period contract to price manual OT on',
    );
  }

  /**
   * Builds one combine group per salary-period contract (or the entry's
   * month-end contract when there are no period rows).
   */
  private buildGroups(
    entry: EntryWithPeriods,
    periods: PeriodRow[],
    previous: ReadonlyArray<{
      contractId: string;
      otCategory: PayrollOtCategory;
      appliedHours: Decimal;
      amount: Decimal;
    }>,
    nextRows: ReadonlyArray<{
      contractId: string;
      otCategory: PayrollOtCategory;
      hours: Decimal;
    }>,
  ): ContractManualOtGroup[] {
    const contractIds = this.contractIdsForEntry(entry, periods, nextRows);
    return contractIds.map((contractId) => {
      const system = this.systemOtForContract(entry, periods, previous, contractId);
      const basic = this.basicForContract(entry, periods, contractId);
      const adjustments: ManualOtAdjustmentInput[] = nextRows
        .filter((row) => row.contractId === contractId)
        .map((row) => ({ category: row.otCategory, hours: num(row.hours) }));
      return {
        contractId,
        basicSalary: basic,
        systemHours: system.hours,
        systemPay: system.pay,
        adjustments,
      };
    });
  }

  private contractIdsForEntry(
    entry: EntryWithPeriods,
    periods: PeriodRow[],
    rows: ReadonlyArray<{ contractId: string }>,
  ): string[] {
    if (periods.length > 0) {
      return periods.map((p) => p.contractId);
    }
    const ids = new Set<string>();
    if (entry.contractId) ids.add(entry.contractId);
    for (const row of rows) ids.add(row.contractId);
    return [...ids];
  }

  private basicForContract(
    entry: EntryWithPeriods,
    periods: PeriodRow[],
    contractId: string,
  ): number {
    const period = periods.find((p) => p.contractId === contractId);
    if (period) return num(period.basicSalary);
    return num(entry.basicSalary);
  }

  /** Period (or entry) OT minus what that contract's stored adjustments added. */
  private systemOtForContract(
    entry: EntryWithPeriods,
    periods: PeriodRow[],
    stored: ReadonlyArray<{
      contractId: string;
      otCategory: PayrollOtCategory;
      appliedHours: Decimal;
      amount: Decimal;
    }>,
    contractId: string,
  ): { hours: OvertimeHoursBuckets; pay: Omit<OvertimePayAmounts, 'totalOtPay'> } {
    const period = periods.find((p) => p.contractId === contractId);
    const mine = stored.filter((row) => row.contractId === contractId);
    if (period) {
      return systemOvertimeFromEntry({
        entryHours: {
          normalHours: num(period.normalOtHours),
          eveningHours: num(period.eveningOtHours),
          sundayHours: num(period.sundayOtHours),
          holidayHours: num(period.holidayOtHours),
        },
        entryPay: {
          normalOtPay: num(period.normalOtPay),
          eveningOtPay: num(period.eveningOtPay),
          sundayOtPay: num(period.sundayOtPay),
          holidayOtPay: num(period.holidayOtPay),
        },
        stored: mine.map((row) => ({
          category: row.otCategory,
          appliedHours: num(row.appliedHours),
          amount: num(row.amount),
        })),
      });
    }
    // Single-contract entry with no period rows: recover from the entry.
    return systemOvertimeFromEntry({
      entryHours: {
        normalHours: num(entry.normalOtHours),
        eveningHours: num(entry.eveningOtHours),
        sundayHours: num(entry.sundayOtHours),
        holidayHours: num(entry.holidayOtHours),
      },
      entryPay: {
        normalOtPay: num(entry.normalOtPay),
        eveningOtPay: num(entry.eveningOtPay),
        sundayOtPay: num(entry.sundayOtPay),
        holidayOtPay: num(entry.holidayOtPay),
      },
      stored: stored.map((row) => ({
        category: row.otCategory,
        appliedHours: num(row.appliedHours),
        amount: num(row.amount),
      })),
    });
  }

  private async applyAndSave<T>(
    run: Prisma.PayrollRunGetPayload<object>,
    entry: EntryWithPeriods,
    periods: PeriodRow[],
    groups: ContractManualOtGroup[],
    ctx: ServiceContext,
    write: (
      tx: Prisma.TransactionClient,
      appliedByContract: ReturnType<
        typeof combineManualOvertimeByContracts
      >['appliedByContract'],
    ) => Promise<T>,
  ): Promise<{
    written: T;
    entry: Prisma.PayrollEntryGetPayload<object>;
    policy: Policy;
  }> {
    const policy = await this.loadPolicy(run);
    const combined = combineManualOvertimeByContracts(groups, policy);
    const entryUpdate = await this.payrollRunService.entryUpdateForOvertime(
      entry,
      run,
      combined,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const written = await write(tx, combined.appliedByContract);

      for (const group of combined.appliedByContract) {
        for (const applied of group.applied) {
          await tx.payrollOtAdjustment.updateMany({
            where: {
              companyId: ctx.companyId,
              payrollRunId: run.id,
              employeeId: entry.employeeId,
              contractId: group.contractId,
              otCategory: applied.category,
            },
            data: {
              appliedHours: new Decimal(applied.hours),
              amount: new Decimal(applied.amount),
            },
          });
        }
      }

      for (const period of periods) {
        const totals = combined.periodTotals.find(
          (p) => p.contractId === period.contractId,
        );
        if (!totals) continue;
        await tx.payrollSalaryPeriod.update({
          where: { id: period.id },
          data: {
            normalOtHours: new Decimal(totals.hours.normalHours),
            eveningOtHours: new Decimal(totals.hours.eveningHours),
            sundayOtHours: new Decimal(totals.hours.sundayHours),
            holidayOtHours: new Decimal(totals.hours.holidayHours),
            normalOtPay: new Decimal(totals.pay.normalOtPay),
            eveningOtPay: new Decimal(totals.pay.eveningOtPay),
            sundayOtPay: new Decimal(totals.pay.sundayOtPay),
            holidayOtPay: new Decimal(totals.pay.holidayOtPay),
            totalOtPay: new Decimal(totals.pay.totalOtPay),
            updatedBy: ctx.userId,
          },
        });
      }

      const updated = await tx.payrollEntry.update({
        where: { id: entry.id },
        data: { ...entryUpdate, updatedBy: ctx.userId },
      });
      return { written, entry: updated };
    });

    await this.payrollRunService.refreshRunTotals(run.id, ctx);
    return { ...result, policy };
  }

  private buildBreakdown(
    run: Prisma.PayrollRunGetPayload<object>,
    employeeId: string,
    entry: EntryWithPeriods | (Prisma.PayrollEntryGetPayload<object> & { salaryPeriods?: PeriodRow[] }) | null,
    rows: AdjustmentRow[],
    policy: Policy,
  ): PayrollOtBreakdown {
    const periods = entry && 'salaryPeriods' in entry ? (entry.salaryPeriods ?? []) : [];
    const entryAsPeriods = entry
      ? ({ ...entry, salaryPeriods: periods } as EntryWithPeriods)
      : null;

    const contractIds = entryAsPeriods
      ? this.contractIdsForEntry(entryAsPeriods, periods, rows)
      : [];

    const contracts: PayrollOtContractOption[] = contractIds.map((contractId) => {
      const period = periods.find((p) => p.contractId === contractId);
      const basic = entryAsPeriods
        ? this.basicForContract(entryAsPeriods, periods, contractId)
        : 0;
      const system = entryAsPeriods
        ? this.systemOtForContract(entryAsPeriods, periods, rows, contractId)
        : { hours: emptyHours(), pay: emptyPay() };
      const rates = Object.fromEntries(
        PAYROLL_OT_CATEGORIES.map((category) => [
          category,
          manualOtHourlyRate(category, basic, policy),
        ]),
      ) as Record<PayrollOtCategory, number>;
      const categories = PAYROLL_OT_CATEGORIES.map((category) => {
        const keys = OT_CATEGORY_KEYS[category];
        const mine = rows.filter(
          (row) => row.contractId === contractId && row.otCategory === category,
        );
        const manualHours = round2(
          mine.reduce((sum, row) => sum + num(row.appliedHours), 0),
        );
        const manualPay = round2(
          mine.reduce((sum, row) => sum + num(row.amount), 0),
        );
        return {
          category,
          systemHours: system.hours[keys.hours],
          systemPay: system.pay[keys.pay],
          manualHours,
          manualPay,
          totalHours: round2(system.hours[keys.hours] + manualHours),
          totalPay: round2(system.pay[keys.pay] + manualPay),
        };
      });
      return {
        contractId,
        contractNumber:
          period?.contract?.contractNumber ??
          rows.find((r) => r.contractId === contractId)?.contract?.contractNumber ??
          null,
        periodStart: isoDate(period?.periodStart),
        periodEnd: isoDate(period?.periodEnd),
        basicSalary: basic,
        categories,
        rates,
      };
    });

    const defaultContractId =
      contracts.length > 0
        ? (entry?.contractId &&
          contracts.some((c) => c.contractId === entry.contractId)
            ? entry.contractId
            : contracts[contracts.length - 1]!.contractId)
        : null;

    const categories = PAYROLL_OT_CATEGORIES.map((category) => {
      const parts = contracts.map(
        (c) => c.categories.find((row) => row.category === category)!,
      );
      const systemHours = round2(parts.reduce((s, p) => s + p.systemHours, 0));
      const systemPay = round2(parts.reduce((s, p) => s + p.systemPay, 0));
      const manualHours = round2(parts.reduce((s, p) => s + p.manualHours, 0));
      const manualPay = round2(parts.reduce((s, p) => s + p.manualPay, 0));
      return {
        category,
        systemHours,
        systemPay,
        manualHours,
        manualPay,
        totalHours: round2(systemHours + manualHours),
        totalPay: round2(systemPay + manualPay),
      };
    });

    const defaultRates =
      contracts.find((c) => c.contractId === defaultContractId)?.rates ??
      (Object.fromEntries(
        PAYROLL_OT_CATEGORIES.map((category) => [
          category,
          manualOtHourlyRate(category, num(entry?.basicSalary), policy),
        ]),
      ) as Record<PayrollOtCategory, number>);

    const sum = (pick: (c: PayrollOtCategoryBreakdown) => number): number =>
      round2(categories.reduce((total, c) => total + pick(c), 0));

    return {
      runId: run.id,
      runStatus: run.status,
      editable: EDITABLE_STATUSES.has(run.status),
      employeeId,
      entryId: entry?.id ?? null,
      overtimeSheetId: entry?.overtimeSheetId ?? null,
      paidDays: num(entry?.payrollDays),
      defaultContractId,
      contracts,
      categories,
      totals: {
        systemPay: sum((c) => c.systemPay),
        manualPay: sum((c) => c.manualPay),
        totalPay: sum((c) => c.totalPay),
      },
      adjustments: rows.map((row) => this.toView(row)),
      rates: defaultRates,
    };
  }

  private toView(row: AdjustmentRow): PayrollOtAdjustmentView {
    return {
      id: row.id,
      payrollRunId: row.payrollRunId,
      employeeId: row.employeeId,
      contractId: row.contractId,
      employee: row.employee,
      otCategory: row.otCategory,
      hours: num(row.hours),
      appliedHours: num(row.appliedHours),
      amount: num(row.amount),
      note: row.note,
      createdBy: row.creator,
      createdAt: row.createdAt,
      updatedBy: row.updater,
      updatedAt: row.updatedAt,
    };
  }
}
