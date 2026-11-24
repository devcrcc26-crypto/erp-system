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
const ctx = { companyId: COMPANY, userId: 'hr-1' };
const BASIC = 12_000;

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    runId: RUN,
    employeeId: EMPLOYEE,
    companyId: COMPANY,
    overtimeSheetId: 'sheet-1',
    payrollDays: new Decimal(30),
    basicSalary: new Decimal(BASIC),
    bonusTopUp: new Decimal(0),
    netTopUp: new Decimal(0),
    // System OT: 4 normal hours priced at 300.
    normalOtHours: new Decimal(4),
    eveningOtHours: new Decimal(0),
    sundayOtHours: new Decimal(0),
    holidayOtHours: new Decimal(0),
    normalOtPay: new Decimal(300),
    eveningOtPay: new Decimal(0),
    sundayOtPay: new Decimal(0),
    holidayOtPay: new Decimal(0),
    ...overrides,
  };
}

describe('PayrollOtAdjustmentService', () => {
  let prisma: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
  let runService: { entryUpdateForOvertime: jest.Mock; refreshRunTotals: jest.Mock };
  let audit: { create: jest.Mock; buildFromRequestContext: jest.Mock };
  let service: PayrollOtAdjustmentService;
  let stored: Array<Record<string, unknown>>;

  beforeEach(() => {
    stored = [];
    const tx = {
      payrollOtAdjustment: {
        upsert: jest.fn(async () => ({ id: 'adj-1' })),
        delete: jest.fn(async () => ({})),
        deleteMany: jest.fn(async () => ({ count: 0 })),
        createMany: jest.fn(async () => ({ count: 0 })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      payrollEntry: { update: jest.fn(async () => ({})) },
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
      payrollEntry: { findFirst: jest.fn(async () => entry()) },
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
    service = new PayrollOtAdjustmentService(
      prisma as never,
      audit as never,
      runService as never,
    );
  });

  it('adds manual hours on top of system OT and reprices the entry', async () => {
    await service.upsert(
      RUN,
      { employeeId: EMPLOYEE, otCategory: 'NORMAL', hours: 6, note: 'Paper records - Nov 2026' },
      ctx,
    );

    const [, , ot] = runService.entryUpdateForOvertime.mock.calls[0] as [
      unknown,
      unknown,
      { hours: { normalHours: number }; pay: { normalOtPay: number } },
    ];
    expect(ot.hours.normalHours).toBe(10);
    expect(ot.pay.normalOtPay).toBeCloseTo(300 + manualOtPay('NORMAL', 6, BASIC), 2);
    expect(runService.refreshRunTotals).toHaveBeenCalledWith(RUN, ctx);
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ot_adjustment_created',
        module: 'payroll',
        afterValue: expect.objectContaining({ hours: 6, otCategory: 'NORMAL' }),
      }),
    );
  });

  it('requires a note', async () => {
    await expect(
      service.upsert(RUN, { employeeId: EMPLOYEE, otCategory: 'NORMAL', hours: 2, note: '  ' }, ctx),
    ).rejects.toThrow('A note is required');
  });

  it('rejects taking a category below zero', async () => {
    await expect(
      service.upsert(
        RUN,
        { employeeId: EMPLOYEE, otCategory: 'NORMAL', hours: -5, note: 'Correction' },
        ctx,
      ),
    ).rejects.toThrow('below zero');
  });

  it('rejects entries with 0 paid days and locked runs', async () => {
    prisma.payrollEntry.findFirst.mockImplementationOnce(async () =>
      entry({ payrollDays: new Decimal(0) }),
    );
    await expect(
      service.upsert(RUN, { employeeId: EMPLOYEE, otCategory: 'SUNDAY', hours: 2, note: 'x' }, ctx),
    ).rejects.toThrow('0 paid days');

    prisma.payrollRun.findFirst.mockImplementationOnce(async () => ({
      id: RUN,
      status: 'APPROVED',
    }));
    await expect(
      service.upsert(RUN, { employeeId: EMPLOYEE, otCategory: 'SUNDAY', hours: 2, note: 'x' }, ctx),
    ).rejects.toThrow('run status: APPROVED');
  });

  it('removing an adjustment restores exactly the system OT', async () => {
    const amount = manualOtPay('NORMAL', 6, BASIC);
    stored = [
      {
        id: 'adj-1',
        payrollRunId: RUN,
        employeeId: EMPLOYEE,
        otCategory: 'NORMAL',
        hours: new Decimal(6),
        appliedHours: new Decimal(6),
        amount: new Decimal(amount),
        note: 'Paper records',
      },
    ];
    // Entry already includes the manual hours and pay.
    prisma.payrollEntry.findFirst.mockImplementation(async () =>
      entry({
        normalOtHours: new Decimal(10),
        normalOtPay: new Decimal(300 + amount),
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

  it('replaceForEmployee writes all categories in one reprice', async () => {
    await service.replaceForEmployee(
      RUN,
      {
        employeeId: EMPLOYEE,
        items: [
          { otCategory: 'NORMAL', hours: 2 },
          { otCategory: 'EVENING', hours: 1.5 },
        ],
        note: 'Paper records - Nov 2026',
      },
      ctx,
    );

    const tx = (prisma as { tx: {
      payrollOtAdjustment: {
        deleteMany: jest.Mock;
        createMany: jest.Mock;
      };
    } }).tx;
    expect(tx.payrollOtAdjustment.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: COMPANY,
          payrollRunId: RUN,
          employeeId: EMPLOYEE,
        }),
      }),
    );
    expect(tx.payrollOtAdjustment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ otCategory: 'NORMAL', hours: expect.any(Decimal) }),
          expect.objectContaining({ otCategory: 'EVENING', hours: expect.any(Decimal) }),
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
    expect(ot.pay.normalOtPay).toBeCloseTo(300 + manualOtPay('NORMAL', 2, BASIC), 2);
    expect(ot.pay.eveningOtPay).toBeCloseTo(manualOtPay('EVENING', 1.5, BASIC), 2);
    expect(runService.refreshRunTotals).toHaveBeenCalledTimes(1);
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ot_adjustment_replaced' }),
    );
  });

  it('replaceForEmployee with empty items clears all manual OT once', async () => {
    const amount = manualOtPay('NORMAL', 6, BASIC);
    stored = [
      {
        id: 'adj-1',
        payrollRunId: RUN,
        employeeId: EMPLOYEE,
        otCategory: 'NORMAL',
        hours: new Decimal(6),
        appliedHours: new Decimal(6),
        amount: new Decimal(amount),
        note: 'Paper records',
      },
    ];
    prisma.payrollEntry.findFirst.mockImplementation(async () =>
      entry({
        normalOtHours: new Decimal(10),
        normalOtPay: new Decimal(300 + amount),
      }),
    );

    await service.replaceForEmployee(RUN, { employeeId: EMPLOYEE, items: [] }, ctx);

    const tx = (prisma as { tx: {
      payrollOtAdjustment: { deleteMany: jest.Mock; createMany: jest.Mock };
    } }).tx;
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
});
