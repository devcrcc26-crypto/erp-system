import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PayrollRunService } from './payroll-run.service';

/**
 * Run lifecycle: approval claims inputs, an approved run can only be reopened
 * (never recalculated or deleted), a paid run is locked, and a correction run
 * pays nothing - its approval creates reconciliation items.
 */

const ctx = { userId: 'hr-1', companyId: 'co-1' };

type Run = Record<string, unknown> & { id: string; status: string; type: string };

function baseRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    companyId: 'co-1',
    runNumber: 'PR-2026-10',
    month: 10,
    year: 2026,
    type: 'REGULAR',
    status: 'SUBMITTED',
    version: 1,
    originalRunId: null,
    previousVersionId: null,
    taxableThreshold: new Decimal(2200),
    considerAttendance: true,
    notes: null,
    createdBy: 'hr-1',
    createdAt: new Date('2026-11-01T08:00:00Z'),
    ...overrides,
  };
}

function setup(run: Run, options: {
  entries?: Array<Record<string, unknown>>;
  overtime?: Array<Record<string, unknown>>;
  settlementLines?: Array<{ reconciliationId: string; amount: Decimal }>;
  reconciliation?: Record<string, unknown>;
  corrections?: number;
} = {}) {
  const runs = new Map<string, Run>([[run.id, run]]);
  const prisma: Record<string, any> = {
    payrollRun: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string } }) =>
        where.id ? (runs.get(where.id) ?? null) : null,
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const current = runs.get(where.id)!;
        Object.assign(current, data);
        return current;
      }),
      create: jest.fn(async ({ data }: { data: Run }) => {
        runs.set(data.id, { ...data });
        return data;
      }),
      count: jest.fn(async () => options.corrections ?? 0),
    },
    payrollEntry: {
      findMany: jest.fn(async () => options.entries ?? []),
      groupBy: jest.fn(async () => []),
    },
    overtimeEntry: {
      findMany: jest.fn(async () => options.overtime ?? []),
      updateMany: jest.fn(async ({ where }: { where: { id?: { in: string[] } } }) => ({
        count: where.id?.in.length ?? 0,
      })),
    },
    payrollAdjustmentLine: {
      findMany: jest.fn(async () => options.settlementLines ?? []),
      createMany: jest.fn(),
    },
    payrollOtAdjustment: { findMany: jest.fn(async () => []), createMany: jest.fn() },
    payrollReconciliation: {
      findUnique: jest.fn(async () => options.reconciliation ?? null),
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => undefined),
      create: jest.fn(async () => undefined),
      deleteMany: jest.fn(async () => undefined),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    payrollCorrectionLine: { findMany: jest.fn(async () => []) },
    payrollStatutoryAdjustment: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => undefined),
      deleteMany: jest.fn(async () => undefined),
    },
    userRole: { findMany: jest.fn(async () => []) },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  const audit = { create: jest.fn(async () => undefined), buildFromRequestContext: (x: unknown) => x };
  const service = new PayrollRunService(
    prisma as never,
    {} as never,
    { send: jest.fn(async () => undefined) } as never,
    {} as never,
    {} as never,
    audit as never,
    { hasPermission: jest.fn(async () => true) } as never,
    {} as never,
  );
  const internals = service as unknown as Record<string, jest.Mock>;
  internals.getRun = jest.fn(async (id: string) => runs.get(id));
  internals.buildEntryDrafts = jest.fn(async () => []);
  internals.persistEntryDrafts = jest.fn(async () => undefined);
  internals.updateRunTotals = jest.fn(async () => undefined);
  internals.rebuildCorrectionEntries = jest.fn(async () => undefined);
  internals.assertEmploymentReviewConfirmed = jest.fn(async () => undefined);
  return { service, prisma, runs };
}

const calculatedAt = new Date('2026-11-02T10:00:00Z');

describe('approving a run', () => {
  it('claims the OT entries it priced, in the same transaction', async () => {
    const { service, prisma } = setup(baseRun(), {
      entries: [{ includedOtEntryIds: ['ot-1', 'ot-2'], createdAt: calculatedAt }],
      overtime: [
        { id: 'ot-1', updatedAt: new Date('2026-11-01T00:00:00Z'), claimedByRunId: null, sheet: { status: 'APPROVED', deletedAt: null } },
        { id: 'ot-2', updatedAt: new Date('2026-11-01T00:00:00Z'), claimedByRunId: null, sheet: { status: 'APPROVED', deletedAt: null } },
      ],
    });

    await service.approveRun('run-1', ctx);

    expect(prisma.overtimeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ot-1', 'ot-2'] }, claimedByRunId: null },
      data: { claimedByRunId: 'run-1', claimedAt: expect.any(Date) },
    });
    expect(prisma.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    );
  });

  it('refuses when OT changed after the run was calculated', async () => {
    const { service, prisma } = setup(baseRun(), {
      entries: [{ includedOtEntryIds: ['ot-1'], createdAt: calculatedAt }],
      overtime: [
        { id: 'ot-1', updatedAt: new Date('2026-11-03T00:00:00Z'), claimedByRunId: null, sheet: { status: 'APPROVED', deletedAt: null } },
      ],
    });

    await expect(service.approveRun('run-1', ctx)).rejects.toThrow(/Recalculate the run/);
    expect(prisma.payrollRun.update).not.toHaveBeenCalled();
  });

  it('refuses when a priced OT entry was already paid by another run', async () => {
    const { service } = setup(baseRun(), {
      entries: [{ includedOtEntryIds: ['ot-1'], createdAt: calculatedAt }],
      overtime: [
        { id: 'ot-1', updatedAt: new Date('2026-11-01T00:00:00Z'), claimedByRunId: 'other-run', sheet: { status: 'APPROVED', deletedAt: null } },
      ],
    });
    await expect(service.approveRun('run-1', ctx)).rejects.toThrow(BadRequestException);
  });

  it('settles the reconciliation items its lines pay, and rejects over-settling', async () => {
    const item = {
      id: 'rec-1',
      amount: new Decimal(3000),
      settledAmount: new Decimal(1000),
      status: 'PARTIALLY_SETTLED',
      forMonth: 9,
      forYear: 2026,
    };
    const ok = setup(baseRun(), {
      settlementLines: [{ reconciliationId: 'rec-1', amount: new Decimal(2000) }],
      reconciliation: item,
    });
    await ok.service.approveRun('run-1', ctx);
    expect(ok.prisma.payrollReconciliation.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: { settledAmount: new Decimal(3000), status: 'SETTLED' },
    });

    const tooMuch = setup(baseRun(), {
      settlementLines: [{ reconciliationId: 'rec-1', amount: new Decimal(2500) }],
      reconciliation: item,
    });
    await expect(tooMuch.service.approveRun('run-1', ctx)).rejects.toThrow(/only 2000.00 ETB is still owed/);
  });

  it('a correction run creates one reconciliation item per changed net pay', async () => {
    const { service, prisma } = setup(
      baseRun({ id: 'corr-1', type: 'CORRECTION', runNumber: 'PR-2026-10-C1', originalRunId: 'run-0' }),
      {
        entries: [],
      },
    );
    prisma.payrollEntry.findMany = jest
      .fn()
      // OT included by the correction (none)
      .mockResolvedValueOnce([])
      // entries with a delta
      .mockResolvedValueOnce([
        { employeeId: 'emp-1', deltaAmount: new Decimal(525) },
        { employeeId: 'emp-2', deltaAmount: new Decimal(-300) },
      ]);

    await service.approveRun('corr-1', ctx);

    expect(prisma.payrollReconciliation.create).toHaveBeenCalledTimes(2);
    expect(prisma.payrollReconciliation.create.mock.calls[0][0].data).toMatchObject({
      employeeId: 'emp-1',
      direction: 'OWED_TO_EMPLOYEE',
      amount: new Decimal(525),
      forMonth: 10,
      forYear: 2026,
      correctionRunId: 'corr-1',
    });
    expect(prisma.payrollReconciliation.create.mock.calls[1][0].data).toMatchObject({
      employeeId: 'emp-2',
      direction: 'OWED_TO_COMPANY',
      amount: new Decimal(300),
    });
  });
});

describe('reopening, deleting and paying', () => {
  it('reopen supersedes the version with the reason, releases its claims and creates the next draft', async () => {
    const { service, prisma, runs } = setup(baseRun({ status: 'GM_APPROVED' }));

    await service.reopenRun('run-1', 'Attendance for site staff was wrong', ctx);

    expect(runs.get('run-1')).toMatchObject({
      status: 'SUPERSEDED',
      reopenReason: 'Attendance for site staff was wrong',
      reopenedBy: 'hr-1',
    });
    expect(prisma.overtimeEntry.updateMany).toHaveBeenCalledWith({
      where: { claimedByRunId: 'run-1' },
      data: { claimedByRunId: null, claimedAt: null },
    });
    const created = prisma.payrollRun.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      status: 'DRAFT',
      version: 2,
      previousVersionId: 'run-1',
      runNumber: 'PR-2026-10-V2',
      month: 10,
      year: 2026,
      type: 'REGULAR',
    });
  });

  it('reopen reverses the settlements the version made', async () => {
    const { service, prisma } = setup(baseRun({ status: 'APPROVED' }), {
      settlementLines: [{ reconciliationId: 'rec-1', amount: new Decimal(1000) }],
      reconciliation: {
        id: 'rec-1',
        amount: new Decimal(3000),
        settledAmount: new Decimal(1000),
        status: 'PARTIALLY_SETTLED',
      },
    });
    await service.reopenRun('run-1', 'Wrong recovery amount', ctx);
    expect(prisma.payrollReconciliation.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: { settledAmount: new Decimal(0), status: 'OPEN' },
    });
  });

  it('needs a reason, and never reopens a paid run or a run with corrections', async () => {
    await expect(setup(baseRun({ status: 'APPROVED' })).service.reopenRun('run-1', ' ', ctx)).rejects.toThrow(/reason/);
    await expect(setup(baseRun({ status: 'PAID' })).service.reopenRun('run-1', 'Wrong figures', ctx)).rejects.toThrow(/paid run is locked/);
    await expect(
      setup(baseRun({ status: 'GM_APPROVED' }), { corrections: 1 }).service.reopenRun('run-1', 'Wrong figures', ctx),
    ).rejects.toThrow(/correction runs/);
  });

  it('an approved run cannot be recalculated or deleted; a draft can be deleted', async () => {
    const approved = setup(baseRun({ status: 'APPROVED' }));
    await expect(approved.service.recalculate('run-1', ctx)).rejects.toThrow(/Reopen it/);
    await expect(approved.service.cancelRun('run-1', ctx)).rejects.toThrow(/Reopen it instead/);

    const draft = setup(baseRun({ status: 'DRAFT' }));
    await draft.service.cancelRun('run-1', ctx);
    expect(draft.runs.get('run-1')?.status).toBe('CANCELLED');
  });

  it('a paid run cannot be unlocked, and a correction run cannot be marked paid', async () => {
    await expect(setup(baseRun({ status: 'PAID' })).service.unlockRun('run-1', ctx)).rejects.toThrow(/paid run is locked/);
    await expect(
      setup(baseRun({ status: 'GM_APPROVED', type: 'CORRECTION' })).service.markPaid('run-1', ctx),
    ).rejects.toThrow(/pays nothing/);
  });
});
