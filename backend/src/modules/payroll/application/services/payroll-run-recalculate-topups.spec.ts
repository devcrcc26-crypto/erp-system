import { Decimal } from '@prisma/client/runtime/library';
import { POLICY_DEFAULTS } from '../../../../shared/policy/policy-definitions';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollRunService } from './payroll-run.service';

jest.mock('../../../../shared/policy/policy-reader.util', () => ({
  loadPolicySnapshot: jest.fn(async () => POLICY_DEFAULTS),
  getPolicy: jest.fn(),
}));

const ctx = { userId: 'hr-1', companyId: 'co-1' };
const run = {
  id: 'run-1',
  companyId: 'co-1',
  runNumber: 'PR-2026-10',
  month: 10,
  year: 2026,
  status: 'DRAFT',
  taxableThreshold: new Decimal(2200),
};

/** Entry as generation leaves it: figures present, no top-ups. */
function regenerated(): Record<string, unknown> {
  return {
    id: 'entry-new',
    runId: 'run-1',
    employeeId: 'emp-1',
    contractId: null,
    payrollDays: new Decimal(30),
    basicSalary: new Decimal(30000),
    earnedSalary: new Decimal(30000),
    transportAllowance: new Decimal(3000),
    monthlyBonus: new Decimal(6000),
    contractNetBonus: new Decimal(0),
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
    notes: null,
  };
}

function setup(existing: Record<string, unknown>, snapshot?: Record<string, unknown>) {
  const update = jest.fn(async () => undefined);
  const prisma = {
    payrollRun: {
      findFirst: jest.fn(async () => run),
      update: jest.fn(async () => undefined),
    },
    payrollEntry: {
      // includedFreelancerIds, existing entries, regenerated entries, then run totals.
      findMany: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([existing])
        .mockResolvedValueOnce([regenerated()])
        .mockResolvedValue([]),
      deleteMany: jest.fn(async () => undefined),
      update,
    },
    payrollSalaryPeriod: { deleteMany: jest.fn(async () => undefined) },
    payrollEntryAudit: {
      findFirst: jest.fn(async () =>
        snapshot ? { oldValue: JSON.stringify(snapshot) } : null,
      ),
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
  );
  const internals = service as unknown as Record<string, unknown>;
  internals.buildEntryDrafts = jest.fn(async () => [{ entry: {}, salaryPeriods: [] }]);
  internals.persistEntryDrafts = jest.fn(async () => undefined);
  internals.getRun = jest.fn(async () => run);
  return { service, update };
}

describe('PayrollRunService.recalculate top-ups', () => {
  it('keeps taxable and net top-ups entered in the bonus modal and pays them', async () => {
    const { service, update } = setup({
      id: 'entry-old',
      employeeId: 'emp-1',
      payrollDays: new Decimal(30),
      bonusTopUp: new Decimal(1000),
      bonusTopUpReason: 'Site bonus',
      netTopUp: new Decimal(500),
      netTopUpReason: 'Relocation',
      notes: null,
    });

    await service.recalculate('run-1', ctx);

    const { data } = (update.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)[0][0];
    const withoutTopUps = new PayrollCalculationService().calculate({
      basicSalary: 30000,
      transportAllowance: 3000,
      monthlyBonus: 6000,
      bonusTopUp: 0,
      payrollDays: 30,
      earnedSalary: 30000,
      overtimeHours: { normalHours: 0, eveningHours: 0, sundayHours: 0, holidayHours: 0 },
      taxableThreshold: 2200,
    });
    expect(Number(data.bonusTopUp)).toBe(1000);
    expect(data.bonusTopUpReason).toBe('Site bonus');
    expect(Number(data.netTopUp)).toBe(500);
    expect(data.netTopUpReason).toBe('Relocation');
    expect(Number(data.taxableIncome)).toBe(withoutTopUps.taxableIncome + 1000);
    expect(Number(data.netPay)).toBeGreaterThan(withoutTopUps.netPay + 500);
  });

  it('keeps top-ups that a 0-day override had cleared from the entry', async () => {
    const { service, update } = setup(
      {
        id: 'entry-old',
        employeeId: 'emp-1',
        payrollDays: new Decimal(0),
        bonusTopUp: new Decimal(0),
        bonusTopUpReason: null,
        netTopUp: new Decimal(0),
        netTopUpReason: null,
        notes: null,
      },
      {
        bonusTopUp: 1000,
        bonusTopUpReason: 'Site bonus',
        netTopUp: 500,
        netTopUpReason: 'Relocation',
      },
    );

    await service.recalculate('run-1', ctx);

    const { data } = (update.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)[0][0];
    expect(Number(data.bonusTopUp)).toBe(1000);
    expect(data.bonusTopUpReason).toBe('Site bonus');
    expect(Number(data.netTopUp)).toBe(500);
    expect(data.netTopUpReason).toBe('Relocation');
  });
});
