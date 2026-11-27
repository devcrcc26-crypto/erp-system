import { Decimal } from '@prisma/client/runtime/library';
import { POLICY_DEFAULTS } from '../../../../shared/policy/policy-definitions';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollRunService } from './payroll-run.service';

jest.mock('../../../../shared/policy/policy-reader.util', () => ({
  loadPolicySnapshot: jest.fn(async () => POLICY_DEFAULTS),
  getPolicy: jest.fn(),
}));

/**
 * Manual correction lines on a CORRECTION run (missed bonus, severance pay,
 * salary arrears, other), per employee:
 * - Taxable lines change gross / taxable income (and the pension base when the
 *   type is pensionable), so tax, pension and net all move.
 * - Net lines change the corrected net only; tax and pension stay unchanged.
 * - A taxable line whose net effect is cancelled by a net line leaves a zero
 *   net difference with a tax difference: a statutory-only reconciliation item.
 * Uses the real pricing code with a small in-memory store. Invented names only.
 */

const ctx = { userId: 'hr-1', companyId: 'co-1' };
const EMPLOYEE_ID = 'emp-ada-mensah';

const correctionRun = {
  id: 'corr',
  companyId: 'co-1',
  runNumber: 'PR-2026-10-C1',
  month: 10,
  year: 2026,
  status: 'DRAFT',
  type: 'CORRECTION',
  originalRunId: 'oct',
  notes: 'Missed items for Ada Mensah',
  createdAt: new Date('2026-11-05T00:00:00Z'),
  taxableThreshold: new Decimal(2200),
};

interface LineType {
  kind: 'EARNING' | 'DEDUCTION';
  taxable: boolean;
  pensionable: boolean;
  systemField: string | null;
}
const MISSED_BONUS: LineType = { kind: 'EARNING', taxable: true, pensionable: false, systemField: null };
const SALARY_ARREARS: LineType = { kind: 'EARNING', taxable: true, pensionable: true, systemField: null };
const OTHER: LineType = { kind: 'EARNING', taxable: true, pensionable: false, systemField: null };

interface StoredLine {
  amount: number;
  note: string;
  type: LineType;
  kindOverride: 'EARNING' | 'DEDUCTION' | null;
  taxableOverride: boolean | null;
}

type Row = Record<string, unknown>;

const calc = new PayrollCalculationService();
const baseInput = {
  basicSalary: 30000,
  transportAllowance: 3000,
  monthlyBonus: 0,
  payrollDays: 30,
  earnedSalary: 30000,
  overtimeHours: { normalHours: 0, eveningHours: 0, sundayHours: 0, holidayHours: 0 },
  taxableThreshold: 2200,
};

function paidEntry(): Row {
  const result = calc.calculate({ ...baseInput, bonusTopUp: 0 });
  return {
    id: 'entry-paid',
    runId: 'oct',
    companyId: 'co-1',
    employeeId: EMPLOYEE_ID,
    contractId: null,
    employeeCategory: 'PERMANENT',
    settlementOnly: false,
    basicSalary: new Decimal(30000),
    employedDays: new Decimal(30),
    payrollDays: new Decimal(30),
    earnedSalary: new Decimal(result.earnedSalary),
    transportAllowance: new Decimal(3000),
    monthlyBonus: new Decimal(0),
    contractNetBonus: new Decimal(0),
    bonusTopUp: new Decimal(0),
    netTopUp: new Decimal(0),
    normalOtHours: new Decimal(0),
    eveningOtHours: new Decimal(0),
    sundayOtHours: new Decimal(0),
    holidayOtHours: new Decimal(0),
    normalOtPay: new Decimal(0),
    eveningOtPay: new Decimal(0),
    sundayOtPay: new Decimal(0),
    holidayOtPay: new Decimal(0),
    unusedLeavePayout: new Decimal(0),
    severancePay: new Decimal(0),
    noticePay: new Decimal(0),
    adjustmentTaxable: new Decimal(0),
    adjustmentNonTaxable: new Decimal(0),
    adjustmentPensionable: new Decimal(0),
    adjustmentDeductions: new Decimal(0),
    grossIncome: new Decimal(result.grossIncome),
    taxableIncome: new Decimal(result.taxableIncome),
    pensionEmployee: new Decimal(result.pensionEmployee),
    pensionEmployer: new Decimal(result.pensionEmployer),
    incomeTax: new Decimal(result.incomeTax),
    totalDeductions: new Decimal(result.totalDeductions),
    netPay: new Decimal(result.netPay),
  };
}

function setup() {
  const paid = paidEntry();
  // The correction starts as a copy of what was paid.
  const corrected: Row = { ...paid, id: 'entry-corr', runId: 'corr', originalAmount: null };
  const lines: StoredLine[] = [];
  const correctionLines: Row[] = [];
  const reconciliations: Row[] = [];

  const prisma: Record<string, Record<string, unknown> | unknown> = {
    payrollRun: { findFirst: jest.fn(async () => null) },
    payrollEntry: {
      findFirst: jest.fn(async ({ where }: { where: { runId: string } }) =>
        where.runId === 'corr' ? { ...corrected, run: correctionRun } : paid,
      ),
      findMany: jest.fn(async ({ where }: { where: { deltaAmount?: unknown } }) =>
        where.deltaAmount && Number(corrected.deltaAmount ?? 0) === 0 ? [] : [corrected],
      ),
      update: jest.fn(async ({ data }: { data: Row }) => Object.assign(corrected, data)),
    },
    payrollOtAdjustment: { findMany: jest.fn(async () => []) },
    payrollAdjustmentLine: {
      findMany: jest.fn(async () =>
        lines.map((line) => ({
          employeeId: EMPLOYEE_ID,
          amount: new Decimal(line.amount),
          note: line.note,
          kindOverride: line.kindOverride,
          taxableOverride: line.taxableOverride,
          adjustmentType: line.type,
        })),
      ),
    },
    payrollCorrectionLine: {
      deleteMany: jest.fn(async () => {
        correctionLines.length = 0;
      }),
      createMany: jest.fn(async ({ data }: { data: Row[] }) => {
        correctionLines.push(...data);
      }),
      findMany: jest.fn(async () => correctionLines),
    },
    payrollReconciliation: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        reconciliations.push(data);
        return data;
      }),
    },
  };
  const service = new PayrollRunService(
    prisma as never,
    calc,
    { send: jest.fn(async () => undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { findSalaryOverride: jest.fn(async () => null), getEffectiveSalary: jest.fn(async () => null) } as never,
  );
  (service as unknown as Record<string, jest.Mock>).updateRunTotals = jest.fn(async () => undefined);

  const apply = async (): Promise<void> => {
    await service.applyAdjustmentLinesToEntry('corr', EMPLOYEE_ID, ctx);
  };
  const diff = (component: string): number =>
    Number(correctionLines.find((line) => line.component === component)?.difference ?? Number.NaN);
  const createItems = async (): Promise<void> => {
    await (
      service as unknown as {
        createReconciliationItems: (tx: unknown, run: unknown, c: unknown) => Promise<void>;
      }
    ).createReconciliationItems(prisma, correctionRun, ctx);
  };
  return { paid, corrected, lines, correctionLines, reconciliations, apply, diff, createItems };
}

const money = (value: unknown): number => Number(value);

describe('manual correction lines', () => {
  it('taxable, owed to the employee: gross and taxable income rise, tax and net follow', async () => {
    const s = setup();
    s.lines.push({
      amount: 5000,
      note: 'Missed October site bonus for Ada Mensah',
      type: MISSED_BONUS,
      kindOverride: 'EARNING',
      taxableOverride: true,
    });
    await s.apply();

    expect(money(s.corrected.adjustmentTaxable)).toBe(5000);
    expect(s.diff('ADJUSTMENT_TAXABLE')).toBe(5000);
    expect(s.diff('GROSS')).toBe(5000);
    expect(s.diff('TAXABLE_INCOME')).toBe(5000);
    // Tax rises, so the employee gets less than the full 5000 net; pension is untouched (not pensionable).
    expect(s.diff('INCOME_TAX')).toBeGreaterThan(0);
    expect(s.diff('PENSION_EMPLOYEE')).toBe(0);
    expect(s.diff('PENSION_EMPLOYER')).toBe(0);
    const netDifference = s.diff('NET_PAY');
    expect(netDifference).toBeGreaterThan(0);
    expect(netDifference).toBeLessThan(5000);
    expect(money(s.corrected.deltaAmount)).toBe(netDifference);
    expect(money(s.corrected.originalAmount)).toBe(money(s.paid.netPay));
    expect(money(s.corrected.correctedAmount)).toBe(money(s.paid.netPay) + netDifference);

    await s.createItems();
    expect(s.reconciliations).toEqual([
      expect.objectContaining({ employeeId: EMPLOYEE_ID, direction: 'OWED_TO_EMPLOYEE' }),
    ]);
  });

  it('taxable and pensionable (salary arrears): pension is recalculated on top of tax', async () => {
    const s = setup();
    s.lines.push({
      amount: 4000,
      note: 'Arrears for Ada Mensah, September',
      type: SALARY_ARREARS,
      kindOverride: 'EARNING',
      taxableOverride: true,
    });
    await s.apply();

    expect(money(s.corrected.adjustmentPensionable)).toBe(4000);
    expect(s.diff('PENSION_EMPLOYEE')).toBe(280); // 7% of 4000
    expect(s.diff('PENSION_EMPLOYER')).toBe(440); // 11% of 4000
    expect(s.diff('INCOME_TAX')).toBeGreaterThan(0);
  });

  it('net, owed to the company: only the corrected net changes; tax and pension do not', async () => {
    const s = setup();
    s.lines.push({
      amount: 1200,
      note: 'Advance not recovered from Kofi Boateng',
      type: OTHER,
      kindOverride: 'DEDUCTION',
      taxableOverride: false,
    });
    await s.apply();

    expect(s.diff('ADJUSTMENT_DEDUCTIONS')).toBe(1200);
    expect(s.diff('NET_PAY')).toBe(-1200);
    expect(s.diff('GROSS')).toBe(0);
    expect(s.diff('TAXABLE_INCOME')).toBe(0);
    expect(s.diff('INCOME_TAX')).toBe(0);
    expect(s.diff('PENSION_EMPLOYEE')).toBe(0);
    expect(money(s.corrected.deltaAmount)).toBe(-1200);

    await s.createItems();
    expect(s.reconciliations).toEqual([
      expect.objectContaining({
        direction: 'OWED_TO_COMPANY',
        amount: new Decimal(1200),
        incomeTaxDifference: new Decimal(0),
      }),
    ]);
  });

  it('taxable, owed to the company: reduces taxable income and tax', async () => {
    const s = setup();
    s.lines.push({
      amount: 2000,
      note: 'Overpaid bonus, Efua Owusu',
      type: MISSED_BONUS,
      kindOverride: 'DEDUCTION',
      taxableOverride: true,
    });
    await s.apply();

    expect(money(s.corrected.adjustmentTaxable)).toBe(-2000);
    expect(s.diff('TAXABLE_INCOME')).toBe(-2000);
    expect(s.diff('INCOME_TAX')).toBeLessThan(0);
    // Net falls by the gross reduction less the tax saved.
    expect(s.diff('NET_PAY')).toBeLessThan(0);
    expect(s.diff('NET_PAY')).toBeGreaterThan(-2000);
  });

  it('taxable line with a zero net difference but a tax difference becomes a statutory-only item', async () => {
    const s = setup();
    s.lines.push({
      amount: 1000,
      note: 'Missed bonus for Ada Mensah',
      type: MISSED_BONUS,
      kindOverride: 'EARNING',
      taxableOverride: true,
    });
    await s.apply();
    const netIncrease = s.diff('NET_PAY');
    expect(netIncrease).toBeGreaterThan(0);

    // The bonus was already paid in cash outside payroll: take the same net back.
    s.lines.push({
      amount: netIncrease,
      note: 'Already paid in cash',
      type: OTHER,
      kindOverride: 'DEDUCTION',
      taxableOverride: false,
    });
    await s.apply();
    expect(s.diff('NET_PAY')).toBe(0);
    expect(s.diff('INCOME_TAX')).toBeGreaterThan(0);

    await s.createItems();
    expect(s.reconciliations).toEqual([
      expect.objectContaining({
        employeeId: EMPLOYEE_ID,
        direction: 'STATUTORY_ONLY',
        amount: new Decimal(0),
        incomeTaxDifference: new Decimal(s.diff('INCOME_TAX')),
      }),
    ]);
  });
});
