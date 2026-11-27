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
        type: 'REGULAR',
        status: options.runStatus ?? 'DRAFT',
      })),
      update: jest.fn(),
    },
    payrollEntry: {
      findFirst: jest.fn(async () => ({
        id: 'entry-1',
        basicSalary: new Decimal(9000),
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
    },
    payrollAdjustmentLine: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'line-1', ...data })),
      findMany: jest.fn(async () => []),
    },
  };
  const runs = { applyAdjustmentLinesToEntry: jest.fn(async () => undefined) };
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
    ).rejects.toThrow(/Only 4000.00 ETB is still owed/);
  });

  it('settles money owed to the company only with a deduction type', async () => {
    const { service } = setup({ item: owedToCompany, type: OTHER });
    await expect(
      service.addLine('run-1', line({ reconciliationId: 'rec-1', adjustmentTypeId: 'type-other' }), ctx),
    ).rejects.toThrow(/deduction type/);
  });

  it('needs a reason to take deductions above one third of the monthly wage', async () => {
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
