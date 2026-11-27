import { Decimal } from '@prisma/client/runtime/library';
import { PayrollAdjustmentService } from './payroll-adjustment.service';

const ctx = { userId: 'hr-1', companyId: 'co-1' };

const RECOVERY = {
  id: 'type-recovery',
  code: 'RECOVERY',
  nameEn: 'Recovery / deduction',
  kind: 'DEDUCTION',
  taxable: false,
  pensionable: false,
  active: true,
  systemField: null,
};
const OTHER = { ...RECOVERY, id: 'type-other', code: 'OTHER', nameEn: 'Other', kind: 'EARNING', taxable: true };

function setup(options: {
  runStatus?: string;
  runType?: 'REGULAR' | 'CORRECTION';
  type?: Record<string, unknown>;
  item?: Record<string, unknown> | null;
  entry?: Record<string, unknown>;
} = {}) {
  const prisma: Record<string, any> = {
    payrollRun: {
      findFirst: jest.fn(async () => ({
        id: 'run-1',
        companyId: 'co-1',
        runNumber: 'PR-2026-12',
        type: options.runType ?? 'REGULAR',
        status: options.runStatus ?? 'DRAFT',
      })),
      update: jest.fn(),
    },
    payrollReconciliationReceipt: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'receipt-1', ...data })),
    },
    $transaction: jest.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => fn(prisma)),
    payrollEntry: {
      findFirst: jest.fn(async () => ({
        id: 'entry-1',
        // Joined mid-month: contract basic 30000, earned 9000. The one-third
        // limit is on earned salary (3000), not contract basic (10000).
        basicSalary: new Decimal(30000),
        earnedSalary: new Decimal(9000),
        adjustmentDeductions: new Decimal(0),
        ...options.entry,
      })),
    },
    payrollAdjustmentType: {
      findFirst: jest.fn(async () => options.type ?? RECOVERY),
      findMany: jest.fn(async () => [{ id: 'type-recovery', code: 'RECOVERY' }]),
    },
    payrollReconciliation: {
      findFirst: jest.fn(async () => options.item ?? null),
      findMany: jest.fn(async () => (options.item ? [options.item] : [])),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...(options.item ?? {}),
        ...data,
      })),
    },
    payrollAdjustmentLine: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'line-1', ...data })),
      findMany: jest.fn(async () => []),
    },
  };
  const runs = {
    applyAdjustmentLinesToEntry: jest.fn(async () => undefined),
    syncSettlementOnlyRows: jest.fn(async () => false),
  };
  const audit = { create: jest.fn(), buildFromRequestContext: (x: unknown) => x };
  const service = new PayrollAdjustmentService(
    prisma as never,
    { hasPermission: jest.fn(async () => true) } as never,
    audit as never,
    runs as never,
  );
  return { service, prisma, runs };
}

/** Owed to the company: 7000, 1000 already recovered, a 2000 line waiting in another draft run. */
const owedToCompany = {
  id: 'rec-1',
  employeeId: 'emp-1',
  direction: 'OWED_TO_COMPANY',
  status: 'PARTIALLY_SETTLED',
  amount: new Decimal(7000),
  settledAmount: new Decimal(1000),
  lines: [
    { amount: new Decimal(1000), payrollRun: { status: 'PAID' } },
    { amount: new Decimal(2000), payrollRun: { status: 'DRAFT' } },
  ],
};

const line = (overrides: Record<string, unknown> = {}) => ({
  employeeId: 'emp-1',
  adjustmentTypeId: 'type-recovery',
  amount: 1500,
  note: 'Advance recovery',
  ...overrides,
});

describe('PayrollAdjustmentService.addLine', () => {
  it('adds a settlement instalment, numbers it and reprices the entry', async () => {
    const { service, prisma, runs } = setup({ item: owedToCompany });
    await service.addLine('run-1', line({ reconciliationId: 'rec-1' }), ctx);
    const data = prisma.payrollAdjustmentLine.create.mock.calls[0][0].data;
    // 1 settled + 1 pending before this one; 4000 - 1500 left = 2 more at this size.
    expect(data).toMatchObject({ instalmentNumber: 3, instalmentCount: 5, reconciliationId: 'rec-1' });
    expect(runs.applyAdjustmentLinesToEntry).toHaveBeenCalledWith('run-1', 'emp-1', ctx);
  });

  it('rejects a line that settles more than is still owed (pending lines count)', async () => {
    const { service } = setup({ item: owedToCompany });
    await expect(
      service.addLine('run-1', line({ reconciliationId: 'rec-1', amount: 4000.01 }), ctx),
    ).rejects.toThrow(/Amount exceeds the remaining balance of 4000\.00 ETB/);
  });

  it('settles money owed to the company only with a deduction type', async () => {
    const { service } = setup({ item: owedToCompany, type: OTHER });
    await expect(
      service.addLine('run-1', line({ reconciliationId: 'rec-1', adjustmentTypeId: 'type-other' }), ctx),
    ).rejects.toThrow(/deduction type/);
  });

  it('needs a reason to take deductions above one third of the earned salary', async () => {
    const { service, prisma } = setup({ entry: { adjustmentDeductions: new Decimal(2000) } });
    // 2000 + 1500 > 9000 / 3
    await expect(service.addLine('run-1', line(), ctx)).rejects.toThrow(/one third of the monthly wage/);
    await service.addLine('run-1', line({ capOverrideReason: 'Employee agreed in writing' }), ctx);
    expect(prisma.payrollAdjustmentLine.create.mock.calls[0][0].data.capOverrideReason).toBe(
      'Employee agreed in writing',
    );
  });

  it('requires a note, a positive amount and a run that is not approved', async () => {
    await expect(setup().service.addLine('run-1', line({ note: '  ' }), ctx)).rejects.toThrow(/note/);
    await expect(setup().service.addLine('run-1', line({ amount: 0 }), ctx)).rejects.toThrow(/greater than 0/);
    await expect(setup({ runStatus: 'APPROVED' }).service.addLine('run-1', line(), ctx)).rejects.toThrow(/Reopen/);
  });
});

describe('PayrollAdjustmentService.suggestSettlement', () => {
  it('suggests a recovery instalment within one third of the wage', async () => {
    const { service } = setup({ item: owedToCompany, entry: { adjustmentDeductions: new Decimal(500) } });
    const suggestion = await service.suggestSettlement('run-1', 'rec-1', 'co-1');
    // Cap 3000, 500 already deducted: 2500 of the 4000 still owed.
    expect(suggestion.amount).toBe(2500);
    expect(suggestion.recovery).toMatchObject({ cap: 3000, capRemaining: 2500, monthlyWage: 9000 });
    expect(suggestion.suggestedTypeId).toBe('type-recovery');
    expect(suggestion.instalmentNumber).toBe(3);
  });
});

describe('statutory-only items', () => {
  const statutoryOnly = {
    id: 'rec-s',
    employeeId: 'emp-1',
    direction: 'STATUTORY_ONLY',
    status: 'OPEN',
    amount: new Decimal(0),
    settledAmount: new Decimal(0),
    lines: [],
    employee: { firstName: 'A', lastName: 'B', employeeId: 'E1' },
    correctionRun: { runNumber: 'CR-1' },
    incomeTaxDifference: new Decimal(10),
    employeePensionDifference: new Decimal(0),
    employerPensionDifference: new Decimal(0),
    statutoryRunId: null,
    reason: 'Tax only',
    waivedReason: null,
    waivedAt: null,
    createdAt: new Date(),
    forMonth: 10,
    forYear: 2026,
    correctionRunId: 'cr-1',
  };

  it('cannot be waived', async () => {
    const { service } = setup({ item: statutoryOnly });
    await expect(service.waive('rec-s', 'Not needed any more', ctx)).rejects.toThrow(
      /cannot be waived/,
    );
  });

  it('cannot be settled with an adjustment line', async () => {
    const { service } = setup({ item: statutoryOnly });
    await expect(
      service.addLine('run-1', line({ reconciliationId: 'rec-s' }), ctx),
    ).rejects.toThrow(/statutory only/);
  });
});

describe('PayrollAdjustmentService.unwaive', () => {
  const waivedOpen = {
    id: 'rec-w',
    employeeId: 'emp-1',
    direction: 'OWED_TO_COMPANY',
    status: 'WAIVED',
    amount: new Decimal(5000),
    settledAmount: new Decimal(1000),
    lines: [],
    employee: { firstName: 'A', lastName: 'B', employeeId: 'E1' },
    correctionRun: { runNumber: 'CR-1' },
    incomeTaxDifference: new Decimal(0),
    employeePensionDifference: new Decimal(0),
    employerPensionDifference: new Decimal(0),
    statutoryRunId: null,
    reason: 'Underpaid',
    waivedReason: 'Written off',
    waivedAt: new Date(),
    createdAt: new Date(),
    forMonth: 10,
    forYear: 2026,
    correctionRunId: 'cr-1',
  };

  it('reopens a waived item to PARTIALLY_SETTLED when some amount was already settled', async () => {
    const { service, prisma } = setup({ item: waivedOpen });
    await service.unwaive('rec-w', ctx);
    expect(prisma.payrollReconciliation.update).toHaveBeenCalledWith({
      where: { id: 'rec-w' },
      data: {
        status: 'PARTIALLY_SETTLED',
        waivedReason: null,
        waivedBy: null,
        waivedAt: null,
      },
    });
  });

  it('rejects items that are not waived', async () => {
    const { service } = setup({ item: { ...waivedOpen, status: 'OPEN' } });
    await expect(service.unwaive('rec-w', ctx)).rejects.toThrow(/Only a waived item/);
  });
});

const MISSED_BONUS = {
  id: 'type-missed',
  code: 'MISSED_BONUS',
  nameEn: 'Missed bonus',
  kind: 'EARNING',
  taxable: true,
  pensionable: false,
  active: true,
  systemField: null,
};

describe('PayrollAdjustmentService.addCorrectionLine', () => {
  const input = (overrides: Record<string, unknown> = {}) => ({
    employeeId: 'emp-1',
    adjustmentTypeId: 'type-missed',
    direction: 'OWED_TO_EMPLOYEE' as const,
    treatment: 'TAXABLE' as const,
    amount: 5000,
    note: 'Missed October site bonus for Ada Mensah',
    ...overrides,
  });

  it('stores a taxable line owed to the employee with its own direction and treatment', async () => {
    const { service, prisma, runs } = setup({ runType: 'CORRECTION', type: MISSED_BONUS });
    await service.addCorrectionLine('run-1', input(), ctx);

    expect(prisma.payrollAdjustmentLine.create.mock.calls[0][0].data).toMatchObject({
      employeeId: 'emp-1',
      adjustmentTypeId: 'type-missed',
      kindOverride: 'EARNING',
      taxableOverride: true,
      isCorrectionLine: true,
      note: 'Missed October site bonus for Ada Mensah',
    });
    expect(Number(prisma.payrollAdjustmentLine.create.mock.calls[0][0].data.amount)).toBe(5000);
    // The entry, net difference and component lines are repriced.
    expect(runs.applyAdjustmentLinesToEntry).toHaveBeenCalledWith('run-1', 'emp-1', ctx);
  });

  it('stores a net line owed to the company as a non-taxable deduction', async () => {
    const { service, prisma } = setup({ runType: 'CORRECTION', type: MISSED_BONUS });
    await service.addCorrectionLine(
      'run-1',
      input({ direction: 'OWED_TO_COMPANY', treatment: 'NET', amount: 1200, note: 'Advance, Kofi Boateng' }),
      ctx,
    );
    expect(prisma.payrollAdjustmentLine.create.mock.calls[0][0].data).toMatchObject({
      kindOverride: 'DEDUCTION',
      taxableOverride: false,
      isCorrectionLine: true,
    });
  });

  it('only works on a correction run that is not approved', async () => {
    await expect(
      setup({ type: MISSED_BONUS }).service.addCorrectionLine('run-1', input(), ctx),
    ).rejects.toThrow(/correction run/);
    await expect(
      setup({ runType: 'CORRECTION', runStatus: 'APPROVED', type: MISSED_BONUS }).service.addCorrectionLine(
        'run-1',
        input(),
        ctx,
      ),
    ).rejects.toThrow(/Reopen/);
  });

  it('requires a note, a positive amount and a correction-line type', async () => {
    const s = () => setup({ runType: 'CORRECTION', type: MISSED_BONUS }).service;
    await expect(s().addCorrectionLine('run-1', input({ note: '  ' }), ctx)).rejects.toThrow(/note/);
    await expect(s().addCorrectionLine('run-1', input({ amount: 0 }), ctx)).rejects.toThrow(/greater than 0/);
    // A built-in bonus type or a recovery type is not a correction-line type.
    await expect(
      setup({ runType: 'CORRECTION', type: { ...MISSED_BONUS, systemField: 'BONUS_TOP_UP' } }).service.addCorrectionLine(
        'run-1',
        input(),
        ctx,
      ),
    ).rejects.toThrow(/Missed bonus, Severance pay, Salary arrears or Other/);
    await expect(
      setup({ runType: 'CORRECTION', type: RECOVERY }).service.addCorrectionLine('run-1', input(), ctx),
    ).rejects.toThrow(/Missed bonus, Severance pay, Salary arrears or Other/);
  });
});

describe('settlement-only rows in the adjustment service', () => {
  const settlementEntry = { settlementOnly: true, earnedSalary: new Decimal(0), adjustmentDeductions: new Decimal(0) };

  it('settles a recovery in full: the one-third limit does not apply with no pay to protect', async () => {
    const { service, prisma } = setup({ item: owedToCompany, entry: settlementEntry });
    // 4000 is still owed; a third of 0 earned salary would block any deduction on a normal row.
    await service.addLine('run-1', line({ reconciliationId: 'rec-1', amount: 4000 }), ctx);
    expect(prisma.payrollAdjustmentLine.create).toHaveBeenCalledTimes(1);
  });

  it('only holds lines that settle a reconciliation item', async () => {
    const { service } = setup({ entry: settlementEntry });
    await expect(service.addLine('run-1', line(), ctx)).rejects.toThrow(/settlement-only row/);
  });

  it('suggests the full remaining balance', async () => {
    const { service } = setup({ item: owedToCompany, entry: settlementEntry });
    const suggestion = await service.suggestSettlement('run-1', 'rec-1', 'co-1');
    expect(suggestion).toMatchObject({
      settlementOnly: true,
      amount: 4000,
      remaining: 4000,
      suggestedTypeId: 'type-recovery',
      recovery: null,
    });
  });
});

describe('PayrollAdjustmentService.recordReceipt', () => {
  const recoverable = {
    id: 'rec-r',
    employeeId: 'emp-1',
    direction: 'OWED_TO_COMPANY',
    status: 'PARTIALLY_SETTLED',
    amount: new Decimal(7000),
    settledAmount: new Decimal(1000),
    lines: [{ amount: new Decimal(1000), payrollRun: { status: 'PAID' } }],
    receipts: [],
    employee: { firstName: 'Kofi', lastName: 'Boateng', employeeId: 'E-7' },
    correctionRun: { runNumber: 'CR-1' },
    incomeTaxDifference: new Decimal(-80),
    employeePensionDifference: new Decimal(-21),
    employerPensionDifference: new Decimal(-33),
    statutoryRunId: null,
    reason: 'Overpaid',
    waivedReason: null,
    waivedAt: null,
    createdAt: new Date(),
    forMonth: 10,
    forYear: 2026,
    correctionRunId: 'cr-1',
  };
  const receipt = (overrides: Record<string, unknown> = {}) => ({
    amount: 6000,
    receivedOn: '2026-11-20',
    reference: 'TRF-0001',
    ...overrides,
  });

  it('settles the item, keeps the receipt and refreshes settlement-only rows', async () => {
    const { service, prisma, runs } = setup({ item: recoverable });
    await service.recordReceipt('rec-r', receipt(), ctx);

    const created = prisma.payrollReconciliationReceipt.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      reconciliationId: 'rec-r',
      reference: 'TRF-0001',
      createdBy: 'hr-1',
    });
    expect(Number(created.amount)).toBe(6000);
    expect(created.receivedOn.toISOString().slice(0, 10)).toBe('2026-11-20');
    const update = prisma.payrollReconciliation.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'rec-r' });
    expect(Number(update.data.settledAmount)).toBe(7000);
    expect(update.data.status).toBe('SETTLED');
    // Nothing left to settle: the employee's settlement-only row goes.
    expect(runs.syncSettlementOnlyRows).toHaveBeenCalledWith(ctx);
  });

  it('a partial receipt leaves the item partially settled', async () => {
    const { service, prisma } = setup({ item: recoverable });
    await service.recordReceipt('rec-r', receipt({ amount: 2000 }), ctx);
    const update = prisma.payrollReconciliation.update.mock.calls[0][0];
    expect(Number(update.data.settledAmount)).toBe(3000);
    expect(update.data.status).toBe('PARTIALLY_SETTLED');
  });

  it('rejects more than is still owed, with the standard message', async () => {
    const { service, prisma } = setup({ item: recoverable });
    await expect(service.recordReceipt('rec-r', receipt({ amount: 6000.01 }), ctx)).rejects.toThrow(
      'Amount exceeds the remaining balance of 6000.00 ETB.',
    );
    expect(prisma.payrollReconciliationReceipt.create).not.toHaveBeenCalled();
  });

  it('only applies to money owed to the company and to items not already closed', async () => {
    await expect(
      setup({ item: { ...recoverable, direction: 'OWED_TO_EMPLOYEE' } }).service.recordReceipt('rec-r', receipt(), ctx),
    ).rejects.toThrow(/owed to the company/);
    await expect(
      setup({ item: { ...recoverable, status: 'SETTLED' } }).service.recordReceipt('rec-r', receipt(), ctx),
    ).rejects.toThrow(/already settled/);
    await expect(
      setup({ item: { ...recoverable, status: 'WAIVED' } }).service.recordReceipt('rec-r', receipt(), ctx),
    ).rejects.toThrow(/already waived/);
  });

  it('blocks while an unapproved run holds a settlement line for the item', async () => {
    const pending = {
      ...recoverable,
      lines: [{ amount: new Decimal(500), payrollRun: { status: 'DRAFT' } }],
    };
    await expect(setup({ item: pending }).service.recordReceipt('rec-r', receipt({ amount: 100 }), ctx)).rejects.toThrow(
      /not yet approved/,
    );
  });

  it('needs a positive amount, a reference and a valid date', async () => {
    const s = () => setup({ item: recoverable }).service;
    await expect(s().recordReceipt('rec-r', receipt({ amount: 0 }), ctx)).rejects.toThrow(/greater than 0/);
    await expect(s().recordReceipt('rec-r', receipt({ reference: ' ' }), ctx)).rejects.toThrow(/reference/);
    await expect(s().recordReceipt('rec-r', receipt({ receivedOn: '20/11/2026' }), ctx)).rejects.toThrow(/date/);
  });
});

describe('waive / unwaive refresh settlement-only rows', () => {
  it('waiving an open item removes the settlement-only row', async () => {
    const { service, runs } = setup({
      item: {
        id: 'rec-x',
        employeeId: 'emp-1',
        direction: 'OWED_TO_COMPANY',
        status: 'OPEN',
        amount: new Decimal(500),
        settledAmount: new Decimal(0),
        lines: [],
        receipts: [],
        employee: { firstName: 'Efua', lastName: 'Owusu', employeeId: 'E-9' },
        correctionRun: { runNumber: 'CR-1' },
        incomeTaxDifference: new Decimal(0),
        employeePensionDifference: new Decimal(0),
        employerPensionDifference: new Decimal(0),
        statutoryRunId: null,
        reason: 'Overpaid',
        waivedReason: null,
        waivedAt: null,
        createdAt: new Date(),
        forMonth: 10,
        forYear: 2026,
        correctionRunId: 'cr-1',
      },
    });
    await service.waive('rec-x', 'Written off by the director', ctx);
    expect(runs.syncSettlementOnlyRows).toHaveBeenCalledWith(ctx);
  });
});
