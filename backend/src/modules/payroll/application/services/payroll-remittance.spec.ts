import { Decimal } from '@prisma/client/runtime/library';
import { PayrollRunService } from './payroll-run.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { adjustmentTotalsFromLines } from '../utils/payroll-adjustment.util';
import {
  buildCorrectionLines,
  correctionComponentAmounts,
  type CorrectionEntrySnapshot,
} from '../utils/payroll-correction.util';
import { loadRunRemittance } from '../utils/payroll-remittance.loader';

/**
 * Correction tax / pension differences are remitted exactly once, in full, by
 * the first payroll run that settles the reconciliation item - whether the
 * correction is owed to the employee, owed to the company, or recovered in
 * instalments. Uses the real approval code and remittance loader on a small
 * in-memory store.
 */

const ctx = { userId: 'hr-1', companyId: 'co-1' };

type Row = Record<string, any>;

function store() {
  const runs = new Map<string, Row>();
  const entries: Row[] = [];
  const correctionLines: Row[] = [];
  const reconciliations: Row[] = [];
  const lines: Row[] = [];
  const statutory: Row[] = [];
  let seq = 0;
  const id = (prefix: string): string => `${prefix}-${(seq += 1)}`;

  const withEmployee = (row: Row) => ({
    ...row,
    employee: { firstName: 'Abebe', lastName: 'Kebede' },
  });

  const prisma: Row = {
    payrollRun: {
      findFirst: async ({ where }: Row) => runs.get(where.id) ?? null,
      update: async ({ where, data }: Row) => Object.assign(runs.get(where.id)!, data),
      count: async () => 0,
    },
    payrollEntry: {
      findMany: async ({ where }: Row) =>
        entries.filter(
          (entry) =>
            entry.runId === where.runId &&
            (where.deltaAmount ? Number(entry.deltaAmount) !== 0 : true),
        ),
      groupBy: async () => [],
    },
    overtimeEntry: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    payrollCorrectionLine: {
      findMany: async ({ where }: Row) =>
        correctionLines.filter(
          (line) =>
            line.correctionRunId === where.correctionRunId &&
            where.component.in.includes(line.component),
        ),
    },
    payrollAdjustmentLine: {
      findMany: async ({ where }: Row) =>
        lines.filter(
          (line) => line.payrollRunId === where.payrollRunId && line.reconciliationId != null,
        ),
    },
    payrollReconciliation: {
      create: async ({ data }: Row) => {
        const row = { id: id('rec'), settledAmount: new Decimal(0), status: 'OPEN', statutoryRunId: null, ...data };
        reconciliations.push(row);
        return row;
      },
      findUnique: async ({ where }: Row) => reconciliations.find((row) => row.id === where.id) ?? null,
      findMany: async ({ where, include }: Row) =>
        reconciliations
          .filter((row) =>
            where.id
              ? where.id.in.includes(row.id)
              : row.companyId === where.companyId &&
                row.direction === where.direction &&
                row.status === where.status &&
                row.statutoryRunId === where.statutoryRunId,
          )
          .map((row) => (include ? withEmployee(row) : row)),
      update: async ({ where, data }: Row) =>
        Object.assign(reconciliations.find((row) => row.id === where.id)!, data),
      updateMany: async ({ where, data }: Row) => {
        const hit = reconciliations.filter(
          (row) =>
            where.id.in.includes(row.id) &&
            row.statutoryRunId === where.statutoryRunId &&
            (where.direction ? row.direction === where.direction : true),
        );
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      },
    },
    payrollStatutoryAdjustment: {
      create: async ({ data }: Row) => {
        if (statutory.some((row) => row.reconciliationId === data.reconciliationId)) {
          throw new Error('unique violation: reconciliation already carried');
        }
        const row = { id: id('stat'), ...data };
        statutory.push(row);
        return row;
      },
      findMany: async ({ where }: Row) =>
        statutory
          .filter((row) => row.payrollRunId === where.payrollRunId)
          .map((row) => ({
            ...row,
            reconciliation: { employee: { firstName: 'Abebe', lastName: 'Kebede' } },
          })),
      deleteMany: async ({ where }: Row) => {
        const before = statutory.length;
        for (let i = statutory.length - 1; i >= 0; i -= 1) {
          if (statutory[i].payrollRunId === where.payrollRunId) statutory.splice(i, 1);
        }
        return { count: before - statutory.length };
      },
    },
    userRole: { findMany: async () => [] },
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);

  const service = new PayrollRunService(
    prisma as never,
    {} as never,
    { send: jest.fn(async () => undefined) } as never,
    {} as never,
    {} as never,
    { create: jest.fn(async () => undefined), buildFromRequestContext: (x: unknown) => x } as never,
    { hasPermission: jest.fn(async () => true) } as never,
    {} as never,
  );
  (service as unknown as Row).assertEmploymentReviewConfirmed = jest.fn(async () => undefined);

  const addRun = (runId: string, overrides: Row = {}): Row => {
    const run = {
      id: runId,
      companyId: 'co-1',
      runNumber: runId.toUpperCase(),
      month: 12,
      year: 2026,
      type: 'REGULAR',
      status: 'SUBMITTED',
      version: 1,
      notes: null,
      createdBy: 'hr-1',
      totalTax: new Decimal(10000),
      totalPensionEmp: new Decimal(2100),
      totalPensionEmr: new Decimal(3300),
      ...overrides,
    };
    runs.set(runId, run);
    return run;
  };

  /** Approves a correction for October 2026 with the given differences. */
  const approveCorrection = async (diff: { net: number; tax: number; emp: number; emr: number }) => {
    addRun('corr', { type: 'CORRECTION', month: 10, originalRunId: 'oct', runNumber: 'PR-2026-10-C1' });
    entries.push({ runId: 'corr', employeeId: 'emp-1', deltaAmount: new Decimal(diff.net) });
    for (const [component, difference] of [
      ['INCOME_TAX', diff.tax],
      ['PENSION_EMPLOYEE', diff.emp],
      ['PENSION_EMPLOYER', diff.emr],
    ] as const) {
      correctionLines.push({ correctionRunId: 'corr', employeeId: 'emp-1', component, difference: new Decimal(difference) });
    }
    await service.approveRun('corr', ctx);
    return reconciliations[0];
  };

  /** A December run with a line settling the item. */
  const settleIn = async (
    runId: string,
    reconciliationId: string,
    amount: number,
    instalmentCount: number | null,
    approve = true,
  ) => {
    addRun(runId);
    lines.push({
      id: id('line'),
      payrollRunId: runId,
      reconciliationId,
      amount: new Decimal(amount),
      instalmentCount,
      createdAt: new Date(),
    });
    if (approve) {
      await service.approveRun(runId, ctx);
    }
  };

  const remittance = (runId: string) => loadRunRemittance(prisma as never, runs.get(runId) as never);

  /** A regular run with no adjustment lines (pays nothing extra to anyone). */
  const approveRegular = async (runId: string, approve = true) => {
    addRun(runId);
    if (approve) {
      await service.approveRun(runId, ctx);
    }
  };

  /** Reopen's release step for an approved run. */
  const release = (runId: string) =>
    (service as unknown as Row).releaseStatutoryDifferences(prisma, runId);

  return {
    service,
    statutory,
    reconciliations,
    lines,
    remittance,
    approveCorrection,
    settleIn,
    approveRegular,
    release,
  };
}

describe('correction tax and pension remittance', () => {
  it('owed to the employee: the item keeps the differences and the settling run remits them once', async () => {
    const s = store();
    const item = await s.approveCorrection({ net: 525, tax: 120, emp: 35, emr: 55 });
    expect(item).toMatchObject({
      direction: 'OWED_TO_EMPLOYEE',
      amount: new Decimal(525),
      incomeTaxDifference: new Decimal(120),
      employeePensionDifference: new Decimal(35),
      employerPensionDifference: new Decimal(55),
    });

    await s.settleIn('dec', item.id, 525, 1);

    const remit = await s.remittance('dec');
    expect(remit.incomeTax.adjustments).toEqual([
      expect.objectContaining({ label: 'Tax adjustment – October 2026 correction', amount: 120, pending: false }),
    ]);
    expect(remit.incomeTax.total).toBe(10120);
    expect(remit.pensionEmployee.total).toBe(2135);
    expect(remit.pensionEmployer.total).toBe(3355);
    expect(s.statutory).toHaveLength(1);
    expect(item.statutoryRunId).toBe('dec');
  });

  it('owed to the company: negative differences reduce what the settling run remits, once', async () => {
    const s = store();
    const item = await s.approveCorrection({ net: -300, tax: -80, emp: -21, emr: -33 });
    expect(item.direction).toBe('OWED_TO_COMPANY');

    await s.settleIn('dec', item.id, 300, 1);

    const remit = await s.remittance('dec');
    expect(remit.incomeTax.total).toBe(9920);
    expect(remit.pensionEmployee.total).toBe(2079);
    expect(remit.pensionEmployer.total).toBe(3267);
    expect(remit.pensionEmployer.adjustments[0].label).toBe(
      'Pension (employer) adjustment – October 2026 correction',
    );
    expect(s.statutory).toHaveLength(1);
  });

  it('recovered in 3 instalments: all differences go with the first instalment, none later', async () => {
    const s = store();
    const item = await s.approveCorrection({ net: -3000, tax: -600, emp: -140, emr: -220 });

    await s.settleIn('dec', item.id, 1000, 3);
    await s.settleIn('jan', item.id, 1000, 3);
    await s.settleIn('feb', item.id, 1000, 3);

    const [dec, jan, feb] = await Promise.all(['dec', 'jan', 'feb'].map((run) => s.remittance(run)));
    expect(dec.incomeTax.adjustments).toEqual([
      expect.objectContaining({
        amount: -600,
        detail: 'Abebe Kebede · carried in full with instalment 1 of 3',
      }),
    ]);
    expect(dec.incomeTax.total).toBe(9400);
    expect(dec.pensionEmployee.total).toBe(1960);
    expect(dec.pensionEmployer.total).toBe(3080);
    for (const later of [jan, feb]) {
      expect(later.incomeTax.adjustments).toEqual([]);
      expect(later.incomeTax.total).toBe(10000);
      expect(later.pensionEmployee.total).toBe(2100);
    }

    // Exactly once across all runs, and the item is fully recovered.
    const carriedTax = [dec, jan, feb].reduce(
      (sum, r) => sum + r.incomeTax.adjustments.reduce((acc, line) => acc + line.amount, 0),
      0,
    );
    expect(carriedTax).toBe(-600);
    expect(s.statutory).toHaveLength(1);
    expect(item.status).toBe('SETTLED');
    expect(Number(item.settledAmount)).toBe(3000);
  });

  it('a draft settling run shows the differences as pending until it is approved', async () => {
    const s = store();
    const item = await s.approveCorrection({ net: 525, tax: 120, emp: 35, emr: 55 });
    await s.settleIn('dec', item.id, 525, 1, false);

    const preview = await s.remittance('dec');
    expect(preview.incomeTax.adjustments).toEqual([
      expect.objectContaining({ amount: 120, pending: true }),
    ]);
    expect(preview.incomeTax.total).toBe(10120);
    // Nothing is carried until approval.
    expect(s.statutory).toHaveLength(0);
    expect(item.statutoryRunId).toBeNull();
  });
});

describe('Taxable bonus (bonus top-up)', () => {
  it('is taxed and never in the pension base', () => {
    const totals = adjustmentTotalsFromLines([
      { amount: 1000, kind: 'EARNING', taxable: true, pensionable: false, systemField: 'BONUS_TOP_UP' },
    ]);
    expect(totals.adjustments.pensionableEarnings).toBe(0);
    const calc = new PayrollCalculationService();
    const input = {
      basicSalary: 30000,
      transportAllowance: 0,
      monthlyBonus: 0,
      payrollDays: 30,
      earnedSalary: 30000,
      overtimeHours: { normalHours: 0, eveningHours: 0, sundayHours: 0, holidayHours: 0 },
      taxableThreshold: 2200,
    };
    const without = calc.calculate({ ...input, bonusTopUp: 0 });
    const withBonus = calc.calculate({ ...input, bonusTopUp: totals.bonusTopUp });
    expect(withBonus.taxableIncome).toBe(without.taxableIncome + 1000);
    expect(withBonus.incomeTax).toBeGreaterThan(without.incomeTax);
    expect(withBonus.pensionEmployee).toBe(without.pensionEmployee);
    expect(withBonus.pensionEmployer).toBe(without.pensionEmployer);
  });
});

describe('statutory-only corrections (zero net difference)', () => {
  /**
   * October paid a net bonus; the correction pays the same amount as a
   * taxable bonus grossed up so the employee's net pay does not change.
   * Income tax rises; net pay and pension do not.
   */
  function netToTaxableBonusLines() {
    const calc = new PayrollCalculationService();
    const input = {
      basicSalary: 30000,
      transportAllowance: 0,
      monthlyBonus: 0,
      payrollDays: 30,
      earnedSalary: 30000,
      overtimeHours: { normalHours: 0, eveningHours: 0, sundayHours: 0, holidayHours: 0 },
      taxableThreshold: 2200,
    };
    const corrected = calc.calculate({ ...input, bonusTopUp: 1000 });
    const noBonus = calc.calculate({ ...input, bonusTopUp: 0 });
    const netBonus = Math.round((corrected.netPay - noBonus.netPay) * 100) / 100;
    const paid = calc.calculate({ ...input, bonusTopUp: 0, netTopUp: netBonus });

    const snapshot = (
      result: typeof paid,
      topUps: { bonusTopUp: number; netTopUp: number },
    ): CorrectionEntrySnapshot => ({
      ...result,
      ...topUps,
      basicSalary: 30000,
      employedDays: 30,
      transportAllowance: 0,
      monthlyBonus: 0,
      contractNetBonus: 0,
      unusedLeavePayout: 0,
      severancePay: 0,
      noticePay: 0,
    });
    const lines = buildCorrectionLines(
      correctionComponentAmounts(snapshot(paid, { bonusTopUp: 0, netTopUp: netBonus })),
      correctionComponentAmounts(snapshot(corrected, { bonusTopUp: 1000, netTopUp: 0 })),
    );
    const diff = (component: string): number =>
      lines.find((line) => line.component === component)!.difference;
    return { diff, netBonus };
  }

  it('creates a statutory-only item that the next approved run declares exactly once', async () => {
    const { diff, netBonus } = netToTaxableBonusLines();
    expect(diff('NET_PAY')).toBe(0);
    expect(diff('TAXABLE_BONUS')).toBe(1000);
    expect(diff('NET_BONUS')).toBe(-netBonus);
    const taxDifference = diff('INCOME_TAX');
    expect(taxDifference).toBeGreaterThan(0);
    expect(diff('PENSION_EMPLOYEE')).toBe(0);

    const s = store();
    const item = await s.approveCorrection({
      net: diff('NET_PAY'),
      tax: taxDifference,
      emp: diff('PENSION_EMPLOYEE'),
      emr: diff('PENSION_EMPLOYER'),
    });
    expect(item).toMatchObject({
      direction: 'STATUTORY_ONLY',
      amount: new Decimal(0),
      status: 'OPEN',
      incomeTaxDifference: new Decimal(taxDifference),
    });

    // Draft December run: previewed, nothing carried yet.
    await s.approveRegular('dec', false);
    const preview = await s.remittance('dec');
    expect(preview.incomeTax.adjustments).toEqual([
      expect.objectContaining({ amount: taxDifference, pending: true }),
    ]);
    expect(s.statutory).toHaveLength(0);

    // Approval declares it and settles the item; no adjustment line, no payment.
    await s.service.approveRun('dec', ctx);
    const dec = await s.remittance('dec');
    expect(dec.incomeTax.adjustments).toEqual([
      expect.objectContaining({
        label: 'Tax adjustment – October 2026 correction',
        amount: taxDifference,
        pending: false,
      }),
    ]);
    expect(dec.incomeTax.total).toBe(Math.round((10000 + taxDifference) * 100) / 100);
    expect(dec.pensionEmployee.adjustments).toEqual([]);
    expect(item.status).toBe('SETTLED');
    expect(item.statutoryRunId).toBe('dec');
    expect(s.lines).toHaveLength(0);

    // The next run declares nothing more.
    await s.approveRegular('jan');
    expect((await s.remittance('jan')).incomeTax.adjustments).toEqual([]);
    expect(s.statutory).toHaveLength(1);
  });

  it('on reopen the declaration moves to the next approved run, still exactly once', async () => {
    const s = store();
    const item = await s.approveCorrection({ net: 0, tax: 250, emp: 0, emr: 0 });
    await s.approveRegular('dec');
    expect(item.status).toBe('SETTLED');

    await s.release('dec');
    expect(item).toMatchObject({ status: 'OPEN', statutoryRunId: null });
    expect(s.statutory).toHaveLength(0);

    await s.approveRegular('dec-v2');
    expect(item).toMatchObject({ status: 'SETTLED', statutoryRunId: 'dec-v2' });
    expect(s.statutory).toHaveLength(1);
    expect((await s.remittance('dec-v2')).incomeTax.total).toBe(10250);
  });
});
