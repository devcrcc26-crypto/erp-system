import { Decimal } from '@prisma/client/runtime/library';
import { POLICY_DEFAULTS } from '../../../../shared/policy/policy-definitions';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollRunService } from './payroll-run.service';

jest.mock('../../../../shared/policy/policy-reader.util', () => ({
  loadPolicySnapshot: jest.fn(async () => POLICY_DEFAULTS),
  getPolicy: jest.fn(),
}));

/**
 * Bonus / net top-ups are adjustment lines on the run (Taxable bonus / Net
 * bonus types). They are never stored only on the entry, so regenerating the
 * run cannot lose them, and they are priced exactly as the old top-up fields.
 */

const ctx = { userId: 'hr-1', companyId: 'co-1' };
const run = {
  id: 'run-1',
  companyId: 'co-1',
  runNumber: 'PR-2026-10',
  month: 10,
  year: 2026,
  status: 'DRAFT',
  type: 'REGULAR',
  taxableThreshold: new Decimal(2200),
};

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'entry-1',
    runId: 'run-1',
    companyId: 'co-1',
    employeeId: 'emp-1',
    contractId: null,
    employeeCategory: 'PERMANENT',
    payrollDays: new Decimal(30),
    basicSalary: new Decimal(30000),
    earnedSalary: new Decimal(30000),
    transportAllowance: new Decimal(3000),
    monthlyBonus: new Decimal(6000),
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
    notes: null,
    run,
    ...overrides,
  };
}

type LineType = {
  kind: 'EARNING' | 'DEDUCTION';
  taxable: boolean;
  pensionable: boolean;
  systemField: string | null;
};
const TAXABLE_BONUS: LineType = { kind: 'EARNING', taxable: true, pensionable: false, systemField: 'BONUS_TOP_UP' };
const NET_BONUS: LineType = { kind: 'EARNING', taxable: false, pensionable: false, systemField: 'NET_TOP_UP' };
const SALARY_ARREARS: LineType = { kind: 'EARNING', taxable: true, pensionable: true, systemField: null };
const RECOVERY: LineType = { kind: 'DEDUCTION', taxable: false, pensionable: false, systemField: null };

function setup(stored: Record<string, unknown>, lines: Array<{ amount: number; note: string; type: LineType }>) {
  const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...stored, ...data }));
  const prisma = {
    payrollRun: {
      findFirst: jest.fn(async () => run),
      update: jest.fn(async () => undefined),
    },
    payrollEntry: {
      findFirst: jest.fn(async () => stored),
      findMany: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _count: { _all: 1 }, _sum: {} })),
      deleteMany: jest.fn(async () => undefined),
      update,
    },
    payrollSalaryPeriod: { deleteMany: jest.fn(async () => undefined) },
    payrollAdjustmentLine: {
      findMany: jest.fn(async () =>
        lines.map((line) => ({
          employeeId: 'emp-1',
          amount: new Decimal(line.amount),
          note: line.note,
          adjustmentType: line.type,
        })),
      ),
      deleteMany: jest.fn(),
    },
  };
  const service = new PayrollRunService(
    prisma as never,
    new PayrollCalculationService(),
    { send: jest.fn(async () => undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { findSalaryOverride: jest.fn(async () => null), getEffectiveSalary: jest.fn(async () => null) } as never,
  );
  return { service, update, prisma };
}

const withoutAdjustments = new PayrollCalculationService().calculate({
  basicSalary: 30000,
  transportAllowance: 3000,
  monthlyBonus: 6000,
  bonusTopUp: 0,
  payrollDays: 30,
  earnedSalary: 30000,
  overtimeHours: { normalHours: 0, eveningHours: 0, sundayHours: 0, holidayHours: 0 },
  taxableThreshold: 2200,
});

describe('PayrollRunService adjustment lines (bonus top-ups and adjustments)', () => {
  it('prices Taxable bonus / Net bonus lines exactly like the old top-up fields', async () => {
    const { service, update } = setup(entry(), [
      { amount: 1000, note: 'Site bonus', type: TAXABLE_BONUS },
      { amount: 500, note: 'Relocation', type: NET_BONUS },
    ]);

    await service.applyAdjustmentLinesToEntry('run-1', 'emp-1', ctx);

    const { data } = update.mock.calls[0][0];
    const expected = new PayrollCalculationService().calculate({
      basicSalary: 30000,
      transportAllowance: 3000,
      monthlyBonus: 6000,
      bonusTopUp: 1000,
      netTopUp: 500,
      payrollDays: 30,
      earnedSalary: 30000,
      overtimeHours: { normalHours: 0, eveningHours: 0, sundayHours: 0, holidayHours: 0 },
      taxableThreshold: 2200,
    });
    expect(Number(data.bonusTopUp)).toBe(1000);
    expect(data.bonusTopUpReason).toBe('Site bonus');
    expect(Number(data.netTopUp)).toBe(500);
    expect(data.netTopUpReason).toBe('Relocation');
    expect(Number(data.taxableIncome)).toBe(withoutAdjustments.taxableIncome + 1000);
    expect(Number(data.netPay)).toBe(expected.netPay);
  });

  it('adds salary arrears to taxable income and the pension base, and takes recoveries off net after tax', async () => {
    const { service, update } = setup(entry(), [
      { amount: 1000, note: 'Arrears for September', type: SALARY_ARREARS },
      { amount: 2000, note: 'Advance recovery', type: RECOVERY },
    ]);

    await service.applyAdjustmentLinesToEntry('run-1', 'emp-1', ctx);

    const { data } = update.mock.calls[0][0];
    expect(Number(data.adjustmentTaxable)).toBe(1000);
    expect(Number(data.adjustmentPensionable)).toBe(1000);
    expect(Number(data.adjustmentDeductions)).toBe(2000);
    expect(Number(data.taxableIncome)).toBe(withoutAdjustments.taxableIncome + 1000);
    // 7% of (30000 earned + 1000 arrears).
    expect(Number(data.pensionEmployee)).toBe(2170);
    // Recovery is not a statutory deduction: totalDeductions stays pension + tax.
    expect(Number(data.totalDeductions)).toBe(
      Number(data.pensionEmployee) + Number(data.incomeTax),
    );
    expect(Number(data.netPay)).toBeCloseTo(
      Number(data.grossIncome) - Number(data.totalDeductions) - 2000,
      2,
    );
  });

  it('pays no bonus lines on an entry with 0 paid days, like generation', async () => {
    const { service, update } = setup(entry({ payrollDays: new Decimal(0), earnedSalary: new Decimal(0) }), [
      { amount: 1000, note: 'Site bonus', type: TAXABLE_BONUS },
      { amount: 500, note: 'Relocation', type: NET_BONUS },
    ]);

    await service.applyAdjustmentLinesToEntry('run-1', 'emp-1', ctx);

    const { data } = update.mock.calls[0][0];
    expect(Number(data.bonusTopUp)).toBe(0);
    expect(Number(data.netTopUp)).toBe(0);
  });

  it('recalculate keeps adjustment lines and entry notes (lines are never deleted)', async () => {
    const { service, prisma } = setup(entry(), []);
    prisma.payrollEntry.findMany = jest
      .fn()
      // includedFreelancerIds
      .mockResolvedValueOnce([])
      // entries with notes
      .mockResolvedValueOnce([{ employeeId: 'emp-1', notes: 'Checked by HR' }])
      .mockResolvedValue([]);
    const internals = service as unknown as Record<string, jest.Mock>;
    internals.buildEntryDrafts = jest.fn(async () => []);
    internals.persistEntryDrafts = jest.fn(async () => undefined);
    internals.getRun = jest.fn(async () => run);

    await service.recalculate('run-1', ctx);

    expect(prisma.payrollAdjustmentLine.deleteMany).not.toHaveBeenCalled();
    const notes = internals.buildEntryDrafts.mock.calls[0][2] as Map<string, string | null>;
    expect(notes.get('emp-1')).toBe('Checked by HR');
  });

  it('refuses to recalculate an approved run (it must be reopened)', async () => {
    const { service, prisma } = setup(entry(), []);
    prisma.payrollRun.findFirst = jest.fn(async () => ({ ...run, status: 'APPROVED' }));
    await expect(service.recalculate('run-1', ctx)).rejects.toThrow(/Reopen it/);
  });
});
