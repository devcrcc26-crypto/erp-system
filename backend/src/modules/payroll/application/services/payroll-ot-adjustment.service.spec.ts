import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Decimal } from '@prisma/client/runtime/library';
import { PayrollOtAdjustmentService } from './payroll-ot-adjustment.service';
import { manualOtPay } from '../utils/payroll-ot-adjustment.util';

jest.mock('../../../../shared/policy/policy-reader.util', () => ({
  // Code-default OT rates: no policy override.
  loadPolicySnapshot: jest.fn(async () => undefined),
}));

const COMPANY = 'company-1';
const RUN = 'run-1';
const EMPLOYEE = 'employee-1';
const CONTRACT_A = 'contract-a';
const CONTRACT_B = 'contract-b';
const ctx = { companyId: COMPANY, userId: 'hr-1' };
const BASIC_A = 12_000;
const BASIC_B = 18_000;

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    runId: RUN,
    employeeId: EMPLOYEE,
    companyId: COMPANY,
    contractId: CONTRACT_B,
    overtimeSheetId: 'sheet-1',
    payrollDays: new Decimal(30),
    basicSalary: new Decimal(BASIC_B),
    bonusTopUp: new Decimal(0),
    netTopUp: new Decimal(0),
    normalOtHours: new Decimal(4),
    eveningOtHours: new Decimal(0),
    sundayOtHours: new Decimal(0),
    holidayOtHours: new Decimal(0),
    normalOtPay: new Decimal(300),
    eveningOtPay: new Decimal(0),
    sundayOtPay: new Decimal(0),
    holidayOtPay: new Decimal(0),
    salaryPeriods: [],
    ...overrides,
  };
}

function period(
  contractId: string,
  basic: number,
  ot: { normalHours?: number; normalPay?: number } = {},
) {
  return {
    id: `period-${contractId}`,
    entryId: 'entry-1',
    contractId,
    periodStart: new Date('2026-11-01'),
    periodEnd: new Date('2026-11-15'),
    days: new Decimal(15),
    basicSalary: new Decimal(basic),
    earnedSalary: new Decimal(basic / 2),
    normalOtHours: new Decimal(ot.normalHours ?? 0),
    eveningOtHours: new Decimal(0),
    sundayOtHours: new Decimal(0),
    holidayOtHours: new Decimal(0),
    normalOtPay: new Decimal(ot.normalPay ?? 0),
    eveningOtPay: new Decimal(0),
    sundayOtPay: new Decimal(0),
    holidayOtPay: new Decimal(0),
    totalOtPay: new Decimal(ot.normalPay ?? 0),
    contract: {
      id: contractId,
      contractNumber: contractId === CONTRACT_A ? 'CN-A' : 'CN-B',
    },
  };
}

describe('PayrollOtAdjustmentService', () => {
  let prisma: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
  let runService: { entryUpdateForOvertime: jest.Mock; refreshRunTotals: jest.Mock };
  let audit: { create: jest.Mock; buildFromRequestContext: jest.Mock };
  let permissions: { hasPermission: jest.Mock };
  let service: PayrollOtAdjustmentService;
  let stored: Array<Record<string, unknown>>;
  let tx: {
    payrollOtAdjustment: Record<string, jest.Mock>;
    payrollEntry: { update: jest.Mock };
    payrollSalaryPeriod: { update: jest.Mock };
  };

  beforeEach(() => {
    stored = [];
    tx = {
      payrollOtAdjustment: {
        upsert: jest.fn(async () => ({ id: 'adj-1' })),
        delete: jest.fn(async () => ({})),
        deleteMany: jest.fn(async () => ({ count: 0 })),
        createMany: jest.fn(async () => ({ count: 0 })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      payrollEntry: { update: jest.fn(async () => entry()) },
      payrollSalaryPeriod: { update: jest.fn(async () => ({})) },
    };
    prisma = {
      payrollRun: {
        findFirst: jest.fn(async () => ({
          id: RUN,
          runNumber: 'PR-2026-11',
          status: 'DRAFT',
          month: 11,
          year: 2026,
          companyId: COMPANY,
          taxableThreshold: new Decimal(2200),
        })),
      },
      payrollEntry: {
        findFirst: jest.fn(async () =>
          entry({
            salaryPeriods: [],
            contractId: CONTRACT_A,
            basicSalary: new Decimal(BASIC_A),
            normalOtHours: new Decimal(4),
            normalOtPay: new Decimal(300),
          }),
        ),
      },
      payrollOtAdjustment: {
        findMany: jest.fn(async () => stored),
        findFirst: jest.fn(async () => stored[0] ?? null),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      tx: tx as never,
    } as never;
    runService = {
      entryUpdateForOvertime: jest.fn(async () => ({ totalOtPay: new Decimal(0) })),
      refreshRunTotals: jest.fn(async () => undefined),
    };
    audit = {
      create: jest.fn(async () => undefined),
      buildFromRequestContext: jest.fn((input: unknown) => input),
    };
    permissions = {
      hasPermission: jest.fn(async () => true),
    };
    service = new PayrollOtAdjustmentService(
      prisma as never,
      audit as never,
      runService as never,
      permissions as never,
    );
  });

  it('adds manual hours on top of system OT and reprices the entry', async () => {
    await service.upsert(
      RUN,
      {
        employeeId: EMPLOYEE,
        contractId: CONTRACT_A,
        otCategory: 'NORMAL',
        hours: 6,
        note: 'Paper records - Nov 2026',
      },
      ctx,
    );

    const [, , ot] = runService.entryUpdateForOvertime.mock.calls[0] as [
      unknown,
      unknown,
      { hours: { normalHours: number }; pay: { normalOtPay: number } },
    ];
    expect(ot.hours.normalHours).toBe(10);
    expect(ot.pay.normalOtPay).toBeCloseTo(300 + manualOtPay('NORMAL', 6, BASIC_A), 2);
    expect(runService.refreshRunTotals).toHaveBeenCalledWith(RUN, ctx);
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ot_adjustment_created',
        module: 'payroll',
        afterValue: expect.objectContaining({
          hours: 6,
          otCategory: 'NORMAL',
          contractId: CONTRACT_A,
        }),
      }),
    );
  });

  it('requires a note', async () => {
    await expect(
      service.upsert(
        RUN,
        {
          employeeId: EMPLOYEE,
          contractId: CONTRACT_A,
          otCategory: 'NORMAL',
          hours: 2,
          note: '  ',
        },
        ctx,
      ),
    ).rejects.toThrow('A note is required');
  });

  it('rejects taking a category below zero', async () => {
    await expect(
      service.upsert(
        RUN,
        {
          employeeId: EMPLOYEE,
          contractId: CONTRACT_A,
          otCategory: 'NORMAL',
          hours: -5,
          note: 'Correction',
        },
        ctx,
      ),
    ).rejects.toThrow('below zero');
  });

  it('rejects entries with 0 paid days and locked runs', async () => {
    prisma.payrollEntry.findFirst.mockImplementationOnce(async () =>
      entry({
        payrollDays: new Decimal(0),
        contractId: CONTRACT_A,
        salaryPeriods: [],
      }),
    );
    await expect(
      service.upsert(
        RUN,
        {
          employeeId: EMPLOYEE,
          contractId: CONTRACT_A,
          otCategory: 'SUNDAY',
          hours: 2,
          note: 'x',
        },
        ctx,
      ),
    ).rejects.toThrow('0 paid days');

    prisma.payrollRun.findFirst.mockImplementationOnce(async () => ({
      id: RUN,
      status: 'APPROVED',
    }));
    await expect(
      service.upsert(
        RUN,
        {
          employeeId: EMPLOYEE,
          contractId: CONTRACT_A,
          otCategory: 'SUNDAY',
          hours: 2,
          note: 'x',
        },
        ctx,
      ),
    ).rejects.toThrow('run status: APPROVED');
  });

  it('removing an adjustment restores exactly the system OT', async () => {
    const amount = manualOtPay('NORMAL', 6, BASIC_A);
    stored = [
      {
        id: 'adj-1',
        payrollRunId: RUN,
        employeeId: EMPLOYEE,
        contractId: CONTRACT_A,
        otCategory: 'NORMAL',
        hours: new Decimal(6),
        appliedHours: new Decimal(6),
        amount: new Decimal(amount),
        note: 'Paper records',
      },
    ];
    prisma.payrollEntry.findFirst.mockImplementation(async () =>
      entry({
        contractId: CONTRACT_A,
        basicSalary: new Decimal(BASIC_A),
        normalOtHours: new Decimal(10),
        normalOtPay: new Decimal(300 + amount),
        salaryPeriods: [],
      }),
    );

    await service.remove(RUN, 'adj-1', ctx);

    const [, , ot] = runService.entryUpdateForOvertime.mock.calls[0] as [
      unknown,
      unknown,
      { hours: { normalHours: number }; pay: { normalOtPay: number } },
    ];
    expect(ot.hours.normalHours).toBe(4);
    expect(ot.pay.normalOtPay).toBe(300);
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ot_adjustment_deleted' }),
    );
  });

  it('replaceForEmployee writes categories for one contract in one reprice', async () => {
    await service.replaceForEmployee(
      RUN,
      {
        employeeId: EMPLOYEE,
        contractId: CONTRACT_A,
        items: [
          { otCategory: 'NORMAL', hours: 2 },
          { otCategory: 'EVENING', hours: 1.5 },
        ],
        note: 'Paper records - Nov 2026',
      },
      ctx,
    );

    expect(tx.payrollOtAdjustment.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: COMPANY,
          payrollRunId: RUN,
          employeeId: EMPLOYEE,
          contractId: CONTRACT_A,
        }),
      }),
    );
    expect(tx.payrollOtAdjustment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            otCategory: 'NORMAL',
            contractId: CONTRACT_A,
            hours: expect.any(Decimal),
          }),
          expect.objectContaining({
            otCategory: 'EVENING',
            contractId: CONTRACT_A,
          }),
        ]),
      }),
    );

    const [, , ot] = runService.entryUpdateForOvertime.mock.calls[0] as [
      unknown,
      unknown,
      {
        hours: { normalHours: number; eveningHours: number };
        pay: { normalOtPay: number; eveningOtPay: number };
      },
    ];
    expect(ot.hours.normalHours).toBe(6);
    expect(ot.hours.eveningHours).toBe(1.5);
    expect(ot.pay.normalOtPay).toBeCloseTo(300 + manualOtPay('NORMAL', 2, BASIC_A), 2);
    expect(ot.pay.eveningOtPay).toBeCloseTo(manualOtPay('EVENING', 1.5, BASIC_A), 2);
    expect(runService.refreshRunTotals).toHaveBeenCalledTimes(1);
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ot_adjustment_replaced' }),
    );
  });

  it('replaceForEmployee on contract A does not wipe contract B and uses A basic', async () => {
    const amountB = manualOtPay('NORMAL', 3, BASIC_B);
    stored = [
      {
        id: 'adj-b',
        payrollRunId: RUN,
        employeeId: EMPLOYEE,
        contractId: CONTRACT_B,
        otCategory: 'NORMAL',
        hours: new Decimal(3),
        appliedHours: new Decimal(3),
        amount: new Decimal(amountB),
        note: 'B paper',
      },
    ];
    prisma.payrollEntry.findFirst.mockImplementation(async () =>
      entry({
        contractId: CONTRACT_B,
        basicSalary: new Decimal(BASIC_B),
        normalOtHours: new Decimal(2 + 4 + 3),
        normalOtPay: new Decimal(
          manualOtPay('NORMAL', 2, BASIC_A) +
            manualOtPay('NORMAL', 4, BASIC_B) +
            amountB,
        ),
        salaryPeriods: [
          period(CONTRACT_A, BASIC_A, {
            normalHours: 2,
            normalPay: manualOtPay('NORMAL', 2, BASIC_A),
          }),
          period(CONTRACT_B, BASIC_B, {
            normalHours: 7,
            normalPay: manualOtPay('NORMAL', 4, BASIC_B) + amountB,
          }),
        ],
      }),
    );

    await service.replaceForEmployee(
      RUN,
      {
        employeeId: EMPLOYEE,
        contractId: CONTRACT_A,
        items: [{ otCategory: 'NORMAL', hours: 5 }],
        note: 'A paper',
      },
      ctx,
    );

    expect(tx.payrollOtAdjustment.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contractId: CONTRACT_A }),
      }),
    );

    const [, , ot] = runService.entryUpdateForOvertime.mock.calls[0] as [
      unknown,
      unknown,
      { hours: { normalHours: number }; pay: { normalOtPay: number } },
    ];
    expect(ot.hours.normalHours).toBe(2 + 5 + 4 + 3);
    expect(ot.pay.normalOtPay).toBeCloseTo(
      manualOtPay('NORMAL', 2, BASIC_A) +
        manualOtPay('NORMAL', 5, BASIC_A) +
        manualOtPay('NORMAL', 4, BASIC_B) +
        amountB,
      2,
    );
    expect(tx.payrollSalaryPeriod.update).toHaveBeenCalled();
  });

  it('replaceForEmployee with empty items clears that contract only', async () => {
    const amount = manualOtPay('NORMAL', 6, BASIC_A);
    stored = [
      {
        id: 'adj-1',
        payrollRunId: RUN,
        employeeId: EMPLOYEE,
        contractId: CONTRACT_A,
        otCategory: 'NORMAL',
        hours: new Decimal(6),
        appliedHours: new Decimal(6),
        amount: new Decimal(amount),
        note: 'Paper records',
      },
    ];
    prisma.payrollEntry.findFirst.mockImplementation(async () =>
      entry({
        contractId: CONTRACT_A,
        basicSalary: new Decimal(BASIC_A),
        normalOtHours: new Decimal(10),
        normalOtPay: new Decimal(300 + amount),
        salaryPeriods: [],
      }),
    );

    await service.replaceForEmployee(
      RUN,
      { employeeId: EMPLOYEE, contractId: CONTRACT_A, items: [] },
      ctx,
    );

    expect(tx.payrollOtAdjustment.deleteMany).toHaveBeenCalled();
    expect(tx.payrollOtAdjustment.createMany).not.toHaveBeenCalled();

    const [, , ot] = runService.entryUpdateForOvertime.mock.calls[0] as [
      unknown,
      unknown,
      { hours: { normalHours: number }; pay: { normalOtPay: number } },
    ];
    expect(ot.hours.normalHours).toBe(4);
    expect(ot.pay.normalOtPay).toBe(300);
    expect(runService.refreshRunTotals).toHaveBeenCalledTimes(1);
  });

  describe('listProfileManualLines', () => {
    const creator = { id: 'hr-1', firstName: 'Ada', lastName: 'Mensah' };

    function profileRow(
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> {
      return {
        id: 'adj-p1',
        employeeId: EMPLOYEE,
        otCategory: 'NORMAL',
        hours: new Decimal(5),
        appliedHours: new Decimal(5),
        amount: new Decimal(375),
        note: 'Paper records - Nov 2026',
        createdAt: new Date('2026-11-10T08:00:00Z'),
        creator,
        updater: creator,
        employee: {
          id: EMPLOYEE,
          firstName: 'Kwame',
          lastName: 'Boateng',
          employeeId: 'E-100',
        },
        contract: { id: CONTRACT_A, contractNumber: 'CN-A' },
        payrollRun: {
          id: RUN,
          runNumber: 'PR-2026-11',
          status: 'DRAFT',
          month: 11,
          year: 2026,
        },
        ...overrides,
      };
    }

    it('returns hours only while the run is still in draft', async () => {
      prisma.payrollOtAdjustment.findMany = jest.fn(async () => [profileRow()]);
      const lines = await service.listProfileManualLines(EMPLOYEE, {
        ...ctx,
        userId: EMPLOYEE,
      });
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        source: 'PAYROLL_MANUAL',
        hours: 5,
        amount: null,
        includedInPayroll: false,
        runNumber: 'PR-2026-11',
        otCategory: 'NORMAL',
        note: 'Paper records - Nov 2026',
        recordedBy: creator,
      });
    });

    it('includes amounts once the run is approved', async () => {
      prisma.payrollOtAdjustment.findMany = jest.fn(async () => [
        profileRow({
          payrollRun: {
            id: RUN,
            runNumber: 'PR-2026-11',
            status: 'APPROVED',
            month: 11,
            year: 2026,
          },
        }),
      ]);
      const [line] = await service.listProfileManualLines(EMPLOYEE, {
        ...ctx,
        userId: EMPLOYEE,
      });
      expect(line.amount).toBe(375);
      expect(line.includedInPayroll).toBe(true);
    });

    it('forbids viewing another employee without hr.view or overtime.manage', async () => {
      permissions.hasPermission = jest.fn(async () => false);
      await expect(
        service.listProfileManualLines(EMPLOYEE, ctx),
      ).rejects.toThrow(/hr\.view|overtime\.manage/);
    });
  });
});
