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
  combineManualOvertime,
  OT_CATEGORY_KEYS,
  PAYROLL_OT_CATEGORIES,
  systemOvertimeFromEntry,
  type ManualOtAdjustmentInput,
} from '../utils/payroll-ot-adjustment.util';
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
} satisfies Prisma.PayrollOtAdjustmentInclude;

type AdjustmentRow = Prisma.PayrollOtAdjustmentGetPayload<{
  include: typeof adjustmentInclude;
}>;

export interface PayrollOtAdjustmentView {
  id: string;
  payrollRunId: string;
  employeeId: string;
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
  categories: PayrollOtCategoryBreakdown[];
  totals: { systemPay: number; manualPay: number; totalPay: number };
  adjustments: PayrollOtAdjustmentView[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function num(value: Decimal | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

/**
 * Manual OT adjustments for paper-based overtime on a payroll run.
 * Each change reprices the employee's entry: system OT is recovered from the
 * entry by removing exactly what the adjustments added before, then the new
 * adjustments are added on top (see payroll-ot-adjustment.util).
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
      orderBy: [{ employeeId: 'asc' }, { otCategory: 'asc' }],
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
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { runId, employeeId, companyId },
    });
    const rows = await this.prisma.payrollOtAdjustment.findMany({
      where: { companyId, payrollRunId: runId, employeeId },
      include: adjustmentInclude,
      orderBy: { otCategory: 'asc' },
    });
    return this.buildBreakdown(run, employeeId, entry, rows);
  }

  /** Creates or updates the adjustment for (employee, category) and reprices the entry. */
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

    const { run, entry, existing } = await this.loadEditable(runId, dto.employeeId, ctx);
    const previous = existing.find((row) => row.otCategory === dto.otCategory) ?? null;

    const next: ManualOtAdjustmentInput[] = [
      ...existing
        .filter((row) => row.otCategory !== dto.otCategory)
        .map((row) => ({ category: row.otCategory, hours: num(row.hours) })),
      { category: dto.otCategory, hours },
    ];

    const system = this.systemOt(entry, existing);
    const keys = OT_CATEGORY_KEYS[dto.otCategory];
    if (system.hours[keys.hours] + hours < 0) {
      throw new BadRequestException(
        `This would take ${dto.otCategory.toLowerCase()} OT below zero: the system has ${system.hours[keys.hours]} hours`,
      );
    }

    const saved = await this.applyAndSave(run, entry, system, next, ctx, async (tx, applied) => {
      const mine = applied.find((row) => row.category === dto.otCategory)!;
      return tx.payrollOtAdjustment.upsert({
        where: {
          payrollRunId_employeeId_otCategory: {
            payrollRunId: runId,
            employeeId: dto.employeeId,
            otCategory: dto.otCategory,
          },
        },
        create: {
          companyId: ctx.companyId,
          payrollRunId: runId,
          employeeId: dto.employeeId,
          otCategory: dto.otCategory,
          hours: new Decimal(hours),
          appliedHours: new Decimal(mine.hours),
          amount: new Decimal(mine.amount),
          note,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
        update: {
          hours: new Decimal(hours),
          appliedHours: new Decimal(mine.hours),
          amount: new Decimal(mine.amount),
          note,
          updatedBy: ctx.userId,
        },
      });
    });

    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'payroll',
        action: previous ? 'ot_adjustment_updated' : 'ot_adjustment_created',
        recordType: 'PayrollOtAdjustment',
        recordId: saved?.id ?? previous?.id ?? '',
        recordReference: run.runNumber,
        beforeValue: previous
          ? {
              employeeId: dto.employeeId,
              otCategory: dto.otCategory,
              hours: num(previous.hours),
              note: previous.note,
            }
          : undefined,
        afterValue: {
          employeeId: dto.employeeId,
          otCategory: dto.otCategory,
          hours,
          note,
        },
      }),
    );

    return this.breakdown(runId, dto.employeeId, ctx.companyId);
  }

  /**
   * Replaces every manual OT row for one employee in a single reprice.
   * Empty `items` clears all adjustments. Used by the spreadsheet-style UI
   * so entering four categories does not reprice four times.
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

    const next: ManualOtAdjustmentInput[] = dto.items.map((item) => ({
      category: item.otCategory,
      hours: round2(item.hours),
    }));
    if (next.some((row) => row.hours === 0)) {
      throw new BadRequestException(
        'Hours cannot be zero. Omit the category instead',
      );
    }

    const { run, entry, existing } = await this.loadEditable(
      runId,
      dto.employeeId,
      ctx,
    );
    const system = this.systemOt(entry, existing);

    for (const row of next) {
      const keys = OT_CATEGORY_KEYS[row.category];
      if (system.hours[keys.hours] + row.hours < 0) {
        throw new BadRequestException(
          `This would take ${row.category.toLowerCase()} OT below zero: the system has ${system.hours[keys.hours]} hours`,
        );
      }
    }

    const before = existing.map((row) => ({
      otCategory: row.otCategory,
      hours: num(row.hours),
      note: row.note,
    }));

    await this.applyAndSave(run, entry, system, next, ctx, async (tx, applied) => {
      await tx.payrollOtAdjustment.deleteMany({
        where: {
          companyId: ctx.companyId,
          payrollRunId: runId,
          employeeId: dto.employeeId,
        },
      });
      if (next.length === 0) {
        return null;
      }
      await tx.payrollOtAdjustment.createMany({
        data: next.map((row) => {
          const mine = applied.find((item) => item.category === row.category)!;
          return {
            companyId: ctx.companyId,
            payrollRunId: runId,
            employeeId: dto.employeeId,
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
    });

    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'payroll',
        action: 'ot_adjustment_replaced',
        recordType: 'PayrollOtAdjustment',
        recordId: entry.id,
        recordReference: run.runNumber,
        beforeValue: { employeeId: dto.employeeId, adjustments: before },
        afterValue: {
          employeeId: dto.employeeId,
          note,
          adjustments: next.map((row) => ({
            otCategory: row.category,
            hours: row.hours,
          })),
        },
      }),
    );

    return this.breakdown(runId, dto.employeeId, ctx.companyId);
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
    const { run, entry, existing } = await this.loadEditable(
      runId,
      target.employeeId,
      ctx,
    );
    const system = this.systemOt(entry, existing);
    const next = existing
      .filter((row) => row.id !== adjustmentId)
      .map((row) => ({ category: row.otCategory, hours: num(row.hours) }));

    await this.applyAndSave(run, entry, system, next, ctx, async (tx) => {
      await tx.payrollOtAdjustment.delete({ where: { id: adjustmentId } });
      return null;
    });

    await this.audit.create(
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
          otCategory: target.otCategory,
          hours: num(target.hours),
          note: target.note,
        },
      }),
    );

    return this.breakdown(runId, target.employeeId, ctx.companyId);
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
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { runId, employeeId, companyId: ctx.companyId },
    });
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
    return { run, entry, existing };
  }

  /** Entry OT minus what the stored adjustments added = system OT. */
  private systemOt(
    entry: Prisma.PayrollEntryGetPayload<object>,
    stored: ReadonlyArray<{
      otCategory: PayrollOtCategory;
      appliedHours: Decimal;
      amount: Decimal;
    }>,
  ) {
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

  /**
   * Prices the new adjustment set on top of system OT, then in one transaction:
   * runs `write` (create/update/delete the changed adjustment), refreshes what
   * every other adjustment added, and saves the repriced entry.
   */
  private async applyAndSave<T>(
    run: Prisma.PayrollRunGetPayload<object>,
    entry: Prisma.PayrollEntryGetPayload<object>,
    system: ReturnType<PayrollOtAdjustmentService['systemOt']>,
    next: ManualOtAdjustmentInput[],
    ctx: ServiceContext,
    write: (
      tx: Prisma.TransactionClient,
      applied: ReturnType<typeof combineManualOvertime>['applied'],
    ) => Promise<T>,
  ): Promise<T> {
    const policy = await loadPolicySnapshot(
      this.prisma,
      ctx.companyId,
      new Date(Date.UTC(run.year, run.month - 1, 1)),
    );
    const combined = combineManualOvertime({
      systemHours: system.hours,
      systemPay: system.pay,
      adjustments: next,
      basicSalary: num(entry.basicSalary),
      rates: policy,
    });
    const entryUpdate = await this.payrollRunService.entryUpdateForOvertime(
      entry,
      run,
      combined,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const written = await write(tx, combined.applied);
      for (const applied of combined.applied) {
        await tx.payrollOtAdjustment.updateMany({
          where: {
            companyId: ctx.companyId,
            payrollRunId: run.id,
            employeeId: entry.employeeId,
            otCategory: applied.category,
          },
          data: {
            appliedHours: new Decimal(applied.hours),
            amount: new Decimal(applied.amount),
          },
        });
      }
      await tx.payrollEntry.update({
        where: { id: entry.id },
        data: { ...entryUpdate, updatedBy: ctx.userId },
      });
      return written;
    });

    await this.payrollRunService.refreshRunTotals(run.id, ctx);
    return result;
  }

  private buildBreakdown(
    run: Prisma.PayrollRunGetPayload<object>,
    employeeId: string,
    entry: Prisma.PayrollEntryGetPayload<object> | null,
    rows: AdjustmentRow[],
  ): PayrollOtBreakdown {
    const system = entry
      ? this.systemOt(entry, rows)
      : {
          hours: { normalHours: 0, eveningHours: 0, sundayHours: 0, holidayHours: 0 },
          pay: { normalOtPay: 0, eveningOtPay: 0, sundayOtPay: 0, holidayOtPay: 0 },
        };
    const categories = PAYROLL_OT_CATEGORIES.map((category) => {
      const keys = OT_CATEGORY_KEYS[category];
      const row = rows.find((item) => item.otCategory === category);
      const manualHours = num(row?.appliedHours);
      const manualPay = num(row?.amount);
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
      categories,
      totals: {
        systemPay: sum((c) => c.systemPay),
        manualPay: sum((c) => c.manualPay),
        totalPay: sum((c) => c.totalPay),
      },
      adjustments: rows.map((row) => this.toView(row)),
    };
  }

  private toView(row: AdjustmentRow): PayrollOtAdjustmentView {
    return {
      id: row.id,
      payrollRunId: row.payrollRunId,
      employeeId: row.employeeId,
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
