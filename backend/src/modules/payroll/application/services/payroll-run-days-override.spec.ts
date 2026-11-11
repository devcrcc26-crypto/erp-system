import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { POLICY_DEFAULTS } from '../../../../shared/policy/policy-definitions';
import { FULLY_ABSENT_NO_PAY_NOTE } from '../../../attendance/application/utils/day-deduction.util';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollRunService } from './payroll-run.service';

jest.mock('../../../../shared/policy/policy-reader.util', () => ({
  loadPolicySnapshot: jest.fn(),
  getPolicy: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadPolicySnapshot } = require('../../../../shared/policy/policy-reader.util');

const ctx = { userId: 'hr-1', companyId: 'co-1' };
const contract = {
  startDate: new Date(Date.UTC(2025, 0, 1)),
  transportationAllowance: new Decimal(3000),
  monthlyBonus: new Decimal(6000),
};

function makeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'entry-1',
    runId: 'run-1',
    companyId: 'co-1',
    employeeId: 'emp-1',
    contractId: 'c-1',
    payrollDays: new Decimal(30),
    employedDays: new Decimal(30),
    basicSalary: new Decimal(30000),
    earnedSalary: new Decimal(30000),
    transportAllowance: new Decimal(3000),
    monthlyBonus: new Decimal(6000),
    contractNetBonus: new Decimal(0),
    bonusTopUp: new Decimal(0),
    netTopUp: new Decimal(500),
    normalOtHours: new Decimal(0),
    eveningOtHours: new Decimal(0),
    sundayOtHours: new Decimal(0),
    holidayOtHours: new Decimal(0),
    normalOtPay: new Decimal(1000),
    eveningOtPay: new Decimal(0),
    sundayOtPay: new Decimal(0),
    holidayOtPay: new Decimal(0),
    unusedLeavePayout: new Decimal(0),
    severancePay: new Decimal(0),
    noticePay: new Decimal(0),
    notes: null,
    contract,
    salaryPeriods: [],
    run: {
      id: 'run-1',
      companyId: 'co-1',
      runNumber: 'PR-2026-10',
      month: 10,
      year: 2026,
      status: 'DRAFT',
      taxableThreshold: new Decimal(2200),
    },
    ...overrides,
  };
}

function setup(entry: Record<string, unknown> | null, policy: object = POLICY_DEFAULTS) {
  (loadPolicySnapshot as jest.Mock).mockResolvedValue(policy);
  const tx = {
    payrollEntry: { update: jest.fn(async ({ data }) => ({ id: 'entry-1', ...data })) },
    payrollSalaryPeriod: { update: jest.fn(async () => undefined) },
    payrollEntryAudit: { create: jest.fn(async () => undefined) },
  };
  const prisma = {
    payrollEntry: { findFirst: jest.fn(async () => entry), findMany: jest.fn(async () => []) },
    payrollRun: { update: jest.fn(async () => undefined) },
    employeeContract: {
      findFirst: jest.fn(async () => ({ pensionApplicable: true, taxApplicable: true })),
    },
    payrollEntryAudit: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async (): Promise<{ oldValue: string } | null> => null),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = {
    create: jest.fn(async () => undefined),
    buildFromRequestContext: (x: unknown) => x,
  };
  const service = new PayrollRunService(
    prisma as never,
    new PayrollCalculationService(),
    {} as never,
    {} as never,
    {} as never,
    audit as never,
    {} as never,
  );
  return { service, prisma, tx, audit };
}

describe('PayrollRunService.overrideEntryDays', () => {
  it('reprices the entry, keeps OT and top-ups, and records who changed what', async () => {
    const { service, tx, audit } = setup(makeEntry());

    await service.overrideEntryDays(
      'run-1',
      'entry-1',
      { payrollDays: 19, reason: '  Unpaid leave  ' },
      ctx,
    );

    const { data } = tx.payrollEntry.update.mock.calls[0][0];
    const expected = new PayrollCalculationService().calculate({
      basicSalary: 30000,
      transportAllowance: 3000,
      monthlyBonus: 6000,
      bonusTopUp: 0,
      netTopUp: 500,
      payrollDays: 19,
      earnedSalary: 19000,
      overtimeHours: { normalHours: 0, eveningHours: 0, sundayHours: 0, holidayHours: 0 },
      overtimePay: { normalOtPay: 1000, eveningOtPay: 0, sundayOtPay: 0, holidayOtPay: 0 },
      taxableThreshold: 2200,
    });
    expect(Number(data.payrollDays)).toBe(19);
    expect(Number(data.earnedSalary)).toBe(19000);
    expect(Number(data.totalOtPay)).toBe(1000);
    expect(Number(data.taxableIncome)).toBe(expected.taxableIncome);
    expect(Number(data.incomeTax)).toBe(expected.incomeTax);
    expect(Number(data.pensionEmployee)).toBe(expected.pensionEmployee);
    expect(Number(data.netPay)).toBe(expected.netPay);
    expect(data.updatedBy).toBe('hr-1');

    expect(tx.payrollEntryAudit.create).toHaveBeenCalledWith({
      data: {
        payrollEntryId: 'entry-1',
        field: 'payrollDays',
        oldValue: '30',
        newValue: '19',
        reason: 'Unpaid leave',
        changedById: 'hr-1',
        companyId: 'co-1',
      },
    });
    expect(audit.create).toHaveBeenCalledTimes(1);
  });

  it('leaves transport and bonus alone when the policy does not reduce them', async () => {
    const { service, tx } = setup(makeEntry());
    await service.overrideEntryDays('run-1', 'entry-1', { payrollDays: 15 }, ctx);
    const { data } = tx.payrollEntry.update.mock.calls[0][0];
    expect(Number(data.transportAllowance)).toBe(3000);
    expect(Number(data.monthlyBonus)).toBe(6000);
  });

  it('prorates transport and bonus when the policy reduces them by absence', async () => {
    const { service, tx } = setup(makeEntry(), {
      ...POLICY_DEFAULTS,
      allowancesReducedByAbsence: true,
    });
    await service.overrideEntryDays('run-1', 'entry-1', { payrollDays: 15 }, ctx);
    const { data } = tx.payrollEntry.update.mock.calls[0][0];
    expect(Number(data.transportAllowance)).toBe(1500);
    expect(Number(data.monthlyBonus)).toBe(3000);
    expect(Number(data.nonTaxableTransport)).toBe(1500);
  });

  it('returns to the exact figures when an override is reversed', async () => {
    const policy = { ...POLICY_DEFAULTS, allowancesReducedByAbsence: true };
    const { service, tx } = setup(
      makeEntry({
        payrollDays: new Decimal(19),
        earnedSalary: new Decimal(19000),
        transportAllowance: new Decimal(1900),
        monthlyBonus: new Decimal(3800),
      }),
      policy,
    );
    await service.overrideEntryDays('run-1', 'entry-1', { payrollDays: 30 }, ctx);
    const { data } = tx.payrollEntry.update.mock.calls[0][0];
    expect(Number(data.earnedSalary)).toBe(30000);
    expect(Number(data.transportAllowance)).toBe(3000);
    expect(Number(data.monthlyBonus)).toBe(6000);
  });

  it('rescales each contract period in a multi-contract month', async () => {
    const period = (id: string, days: number, basic: number, earned: number) => ({
      id,
      days: new Decimal(days),
      basicSalary: new Decimal(basic),
      earnedSalary: new Decimal(earned),
      contract,
    });
    // Contracts of 10 and 20 days, already at 15 paid days out of 30.
    const { service, tx } = setup(
      makeEntry({
        payrollDays: new Decimal(15),
        earnedSalary: new Decimal(13000),
        salaryPeriods: [period('p-1', 5, 18000, 3000), period('p-2', 10, 30000, 10000)],
      }),
    );

    await service.overrideEntryDays('run-1', 'entry-1', { payrollDays: 30 }, ctx);

    const { data } = tx.payrollEntry.update.mock.calls[0][0];
    expect(Number(data.earnedSalary)).toBe(26000);
    const calls = tx.payrollSalaryPeriod.update.mock.calls as unknown as Array<
      [{ where: { id: string }; data: { days: Decimal; earnedSalary: Decimal } }]
    >;
    const periods = calls.map(([arg]) => [
      arg.where.id,
      Number(arg.data.days),
      Number(arg.data.earnedSalary),
    ]);
    expect(periods).toEqual([
      ['p-1', 10, 6000],
      ['p-2', 20, 20000],
    ]);
  });

  it('pays nothing at 0 days, then restores everything when the days are raised again', async () => {
    const original = makeEntry({
      bonusTopUp: new Decimal(200),
      bonusTopUpReason: 'Site bonus',
      normalOtHours: new Decimal(5),
    });
    const toZero = setup(original);
    await toZero.service.overrideEntryDays('run-1', 'entry-1', { payrollDays: 0 }, ctx);

    const zeroed = toZero.tx.payrollEntry.update.mock.calls[0][0].data;
    for (const field of [
      'payrollDays',
      'earnedSalary',
      'transportAllowance',
      'monthlyBonus',
      'bonusTopUp',
      'netTopUp',
      'normalOtHours',
      'totalOtPay',
      'grossIncome',
      'pensionEmployee',
      'incomeTax',
      'netPay',
    ]) {
      expect(Number(zeroed[field])).toBe(0);
    }
    const auditCalls = toZero.tx.payrollEntryAudit.create.mock.calls as unknown as Array<
      [{ data: { field: string; oldValue: string } }]
    >;
    const snapshotRow = auditCalls.map(([arg]) => arg.data).find((d) => d.field === 'zeroDaysSnapshot');
    expect(snapshotRow).toBeDefined();

    const back = setup({ ...original, ...zeroed, salaryPeriods: [] });
    back.prisma.payrollEntryAudit.findFirst.mockResolvedValue({ oldValue: snapshotRow!.oldValue });
    await back.service.overrideEntryDays('run-1', 'entry-1', { payrollDays: 30 }, ctx);

    const restored = back.tx.payrollEntry.update.mock.calls[0][0].data;
    expect(Number(restored.earnedSalary)).toBe(30000);
    expect(Number(restored.transportAllowance)).toBe(3000);
    expect(Number(restored.monthlyBonus)).toBe(6000);
    expect(Number(restored.bonusTopUp)).toBe(200);
    expect(restored.bonusTopUpReason).toBe('Site bonus');
    expect(Number(restored.netTopUp)).toBe(500);
    expect(Number(restored.normalOtHours)).toBe(5);
    expect(Number(restored.totalOtPay)).toBe(1000);
    expect(Number(restored.netPay)).toBeGreaterThan(0);
  });

  it('does nothing when the days are unchanged', async () => {
    const { service, tx, prisma } = setup(makeEntry());
    await service.overrideEntryDays('run-1', 'entry-1', { payrollDays: 30 }, ctx);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.payrollEntryAudit.create).not.toHaveBeenCalled();
  });

  it.each(['SUBMITTED', 'APPROVED', 'GM_APPROVED', 'PAID', 'CANCELLED'])(
    'rejects a run in %s status',
    async (status) => {
      const base = makeEntry();
      const { service, prisma } = setup({
        ...base,
        run: { ...(base.run as object), status },
      });
      await expect(
        service.overrideEntryDays('run-1', 'entry-1', { payrollDays: 19 }, ctx),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('scopes the lookup to the run and company', async () => {
    const { service, prisma } = setup(null);
    await expect(
      service.overrideEntryDays('run-1', 'entry-1', { payrollDays: 19 }, ctx),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.payrollEntry.findFirst.mock.calls[0]).toBeDefined();
    const [args] = prisma.payrollEntry.findFirst.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(args.where).toMatchObject({ id: 'entry-1', runId: 'run-1', companyId: 'co-1' });
  });

  it.each([
    ['zero paid days', { payrollDays: new Decimal(0) }],
    [
      'the fully-absent note with no allowances',
      {
        notes: FULLY_ABSENT_NO_PAY_NOTE,
        transportAllowance: new Decimal(0),
        monthlyBonus: new Decimal(0),
      },
    ],
    ['no contract', { contract: null }],
  ])('rejects an entry with %s', async (_label, overrides) => {
    const { service, prisma } = setup(makeEntry(overrides));
    await expect(
      service.overrideEntryDays('run-1', 'entry-1', { payrollDays: 19 }, ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('PayrollRunService.getEntryAudit', () => {
  it('scopes history to the run and company', async () => {
    const { service, prisma } = setup(null);
    await service.getEntryAudit('run-1', 'entry-1', 'co-1');
    const [args] = prisma.payrollEntryAudit.findMany.mock.calls[0] as unknown as [
      { where: unknown; orderBy: unknown },
    ];
    expect(args.where).toEqual({
      payrollEntryId: 'entry-1',
      companyId: 'co-1',
      field: 'payrollDays',
      payrollEntry: { runId: 'run-1' },
    });
    expect(args.orderBy).toEqual({ changedAt: 'desc' });
  });
});
