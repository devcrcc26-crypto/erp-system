import { BadRequestException } from '@nestjs/common';
import { PayrollRunService } from './payroll-run.service';

/**
 * A regular run carries a "Settlement only" row for an employee who is not
 * otherwise in the run (e.g. an ended contract) but still has open
 * reconciliation items. The row is added on generate / recalculate and removed
 * once nothing is left to settle. Invented names only.
 */

const ctx = { userId: 'hr-1', companyId: 'co-1' };
const run = { id: 'run-1', companyId: 'co-1', type: 'REGULAR', status: 'DRAFT' } as const;

interface Item {
  employeeId: string;
  direction: 'OWED_TO_EMPLOYEE' | 'OWED_TO_COMPANY' | 'STATUTORY_ONLY';
  status: 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'WAIVED';
  statutoryRunId: string | null;
}
interface RunEntry {
  id: string;
  employeeId: string;
  settlementOnly: boolean;
}

function setup(items: Item[], entries: RunEntry[]) {
  const created: Array<Record<string, unknown>> = [];
  const prisma: Record<string, unknown> = {
    payrollReconciliation: {
      // Only open-ish items are asked for.
      findMany: jest.fn(async () =>
        items.filter((i) => i.status === 'OPEN' || i.status === 'PARTIALLY_SETTLED'),
      ),
    },
    payrollEntry: {
      findMany: jest.fn(async () => entries),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      }),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    payrollAdjustmentLine: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    user: {
      findMany: jest.fn(async () => [
        {
          id: 'emp-ada-mensah',
          employeeType: 'PERMANENT',
          bankName: 'Test Bank',
          bankAccountNumber: '1000000000001',
        },
      ]),
    },
  };
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  const service = new PayrollRunService(
    prisma as never,
    {} as never,
    { send: jest.fn(async () => undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const internals = service as unknown as Record<string, jest.Mock>;
  internals.applyAdjustmentLinesToEntry = jest.fn(async () => undefined);
  internals.updateRunTotals = jest.fn(async () => undefined);
  return { service, prisma, created, internals };
}

describe('PayrollRunService.syncSettlementOnlyEntries', () => {
  it('adds a zero-pay settlement-only row for an employee with an open item who is not in the run', async () => {
    const { service, created, internals } = setup(
      [
        {
          employeeId: 'emp-ada-mensah',
          direction: 'OWED_TO_EMPLOYEE',
          status: 'OPEN',
          statutoryRunId: null,
        },
      ],
      [{ id: 'entry-kofi', employeeId: 'emp-kofi-boateng', settlementOnly: false }],
    );

    const changed = await service.syncSettlementOnlyEntries(run, ctx);

    expect(changed).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      employeeId: 'emp-ada-mensah',
      runId: 'run-1',
      settlementOnly: true,
      flag: 'NONE',
      bankName: 'Test Bank',
    });
    // Priced from its settlement lines only, then the run totals follow.
    expect(internals.applyAdjustmentLinesToEntry).toHaveBeenCalledWith(
      'run-1',
      'emp-ada-mensah',
      ctx,
    );
    expect(internals.updateRunTotals).toHaveBeenCalledWith('run-1', ctx);
  });

  it('adds a row for a recovery owed to the company, and for a statutory-only item', async () => {
    const { service, created } = setup(
      [
        {
          employeeId: 'emp-ada-mensah',
          direction: 'OWED_TO_COMPANY',
          status: 'PARTIALLY_SETTLED',
          statutoryRunId: null,
        },
      ],
      [],
    );
    await service.syncSettlementOnlyEntries(run, ctx);
    expect(created).toHaveLength(1);

    const statutory = setup(
      [
        {
          employeeId: 'emp-ada-mensah',
          direction: 'STATUTORY_ONLY',
          status: 'OPEN',
          statutoryRunId: null,
        },
      ],
      [],
    );
    await statutory.service.syncSettlementOnlyEntries(run, ctx);
    expect(statutory.created).toHaveLength(1);
  });

  it('does not touch an employee who already has a normal row', async () => {
    const { service, created, internals } = setup(
      [
        {
          employeeId: 'emp-ada-mensah',
          direction: 'OWED_TO_EMPLOYEE',
          status: 'OPEN',
          statutoryRunId: null,
        },
      ],
      [{ id: 'entry-ada', employeeId: 'emp-ada-mensah', settlementOnly: false }],
    );
    expect(await service.syncSettlementOnlyEntries(run, ctx)).toBe(false);
    expect(created).toHaveLength(0);
    expect(internals.updateRunTotals).not.toHaveBeenCalled();
  });

  it('removes the row and its copied lines once the item is settled or waived', async () => {
    const { service, prisma, created } = setup(
      [
        {
          employeeId: 'emp-ada-mensah',
          direction: 'OWED_TO_EMPLOYEE',
          status: 'SETTLED',
          statutoryRunId: null,
        },
      ],
      [{ id: 'entry-ada', employeeId: 'emp-ada-mensah', settlementOnly: true }],
    );

    const changed = await service.syncSettlementOnlyEntries(run, ctx);

    expect(changed).toBe(true);
    expect(created).toHaveLength(0);
    const lines = (prisma.payrollAdjustmentLine as { deleteMany: jest.Mock }).deleteMany;
    expect(lines).toHaveBeenCalledWith({
      where: expect.objectContaining({
        payrollRunId: 'run-1',
        employeeId: { in: ['emp-ada-mensah'] },
      }),
    });
    const entries = (prisma.payrollEntry as { deleteMany: jest.Mock }).deleteMany;
    expect(entries).toHaveBeenCalledWith({ where: { id: { in: ['entry-ada'] } } });
  });

  it('leaves correction runs and approved runs alone', async () => {
    const items: Item[] = [
      {
        employeeId: 'emp-ada-mensah',
        direction: 'OWED_TO_EMPLOYEE',
        status: 'OPEN',
        statutoryRunId: null,
      },
    ];
    const { service, created } = setup(items, []);
    expect(await service.syncSettlementOnlyEntries({ ...run, type: 'CORRECTION' }, ctx)).toBe(false);
    expect(await service.syncSettlementOnlyEntries({ ...run, status: 'APPROVED' }, ctx)).toBe(false);
    expect(created).toHaveLength(0);
  });
});

describe('settlement-only rows are not edited like salary rows', () => {
  it('refuses a salary edit with a clear message', () => {
    const { service } = setup([], []);
    const guard = (
      service as unknown as { assertNotSettlementOnly: (entry: { settlementOnly: boolean }) => void }
    ).assertNotSettlementOnly.bind(service);
    expect(() => guard({ settlementOnly: true })).toThrow(BadRequestException);
    expect(() => guard({ settlementOnly: true })).toThrow(/settlement-only row/);
    expect(() => guard({ settlementOnly: false })).not.toThrow();
  });
});
