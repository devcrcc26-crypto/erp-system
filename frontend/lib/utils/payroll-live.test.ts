import { describe, expect, it } from 'vitest';
import type {
  PayrollEntryDetail,
  PayrollOtBreakdown,
  PayrollRunDetail,
} from '@/lib/api/payroll.types';
import {
  entryWithOt,
  entryWithTopUp,
  previewManualRow,
  previewOtBreakdown,
  runWithEntry,
} from '@/lib/utils/payroll-live';
import { estimateEthiopianTax } from '@/lib/utils/payroll-entry-detail';

function entry(overrides: Partial<PayrollEntryDetail> = {}): PayrollEntryDetail {
  return {
    id: 'e1',
    totalOtPay: 300,
    normalOtHours: 4,
    normalOtPay: 300,
    eveningOtHours: 0,
    eveningOtPay: 0,
    sundayOtHours: 0,
    sundayOtPay: 0,
    holidayOtHours: 0,
    holidayOtPay: 0,
    grossIncome: 12_300,
    taxableIncome: 12_300,
    incomeTax: estimateEthiopianTax(12_300),
    totalDeductions: 840 + estimateEthiopianTax(12_300),
    pensionEmployee: 840,
    pensionEmployer: 1320,
    netPay: 12_300 - 840 - estimateEthiopianTax(12_300),
    bonusTopUp: 0,
    netTopUp: 0,
    contractNetBonus: 0,
    ...overrides,
  } as unknown as PayrollEntryDetail;
}

function breakdown(): PayrollOtBreakdown {
  const categories = [
    { category: 'NORMAL' as const, systemHours: 4, systemPay: 300, manualHours: 0, manualPay: 0, totalHours: 4, totalPay: 300 },
    { category: 'EVENING' as const, systemHours: 2, systemPay: 218.75, manualHours: 0, manualPay: 0, totalHours: 2, totalPay: 218.75 },
    { category: 'SUNDAY' as const, systemHours: 0, systemPay: 0, manualHours: 0, manualPay: 0, totalHours: 0, totalPay: 0 },
    { category: 'HOLIDAY' as const, systemHours: 0, systemPay: 0, manualHours: 0, manualPay: 0, totalHours: 0, totalPay: 0 },
  ];
  const rates = { NORMAL: 93.75, EVENING: 109.375, SUNDAY: 125, HOLIDAY: 153.0612 };
  return {
    runId: 'r1',
    runStatus: 'DRAFT',
    editable: true,
    employeeId: 'u1',
    entryId: 'e1',
    overtimeSheetId: null,
    paidDays: 30,
    defaultContractId: 'c1',
    contracts: [
      {
        contractId: 'c1',
        contractNumber: 'CN-1',
        periodStart: null,
        periodEnd: null,
        basicSalary: 12_000,
        categories,
        rates,
      },
    ],
    adjustments: [],
    rates,
    categories,
    totals: { systemPay: 518.75, manualPay: 0, totalPay: 518.75 },
  };
}

describe('previewManualRow', () => {
  it('prices hours at the rate and never takes a category below zero', () => {
    expect(previewManualRow({ systemHours: 4, systemPay: 300 }, 6, 93.75)).toEqual({
      appliedHours: 6,
      pay: 562.5,
    });
    expect(previewManualRow({ systemHours: 2, systemPay: 218.75 }, -5, 109.375)).toEqual({
      appliedHours: -2,
      pay: -218.75,
    });
  });
});

describe('previewOtBreakdown', () => {
  it('updates totals for the typed hours', () => {
    const preview = previewOtBreakdown(breakdown(), { NORMAL: 6, SUNDAY: 2 }, 'c1');
    expect(preview.contractCategories[0]).toEqual(
      expect.objectContaining({ manualHours: 6, manualPay: 562.5, totalHours: 10, totalPay: 862.5 }),
    );
    expect(preview.contractCategories[2]).toEqual(
      expect.objectContaining({ manualHours: 2, manualPay: 250, totalPay: 250 }),
    );
    expect(preview.contractTotals).toEqual({
      systemPay: 518.75,
      manualPay: 812.5,
      totalPay: 1331.25,
    });
    expect(preview.totals).toEqual({ systemPay: 518.75, manualPay: 812.5, totalPay: 1331.25 });
  });
});

describe('entryWithOt', () => {
  it('moves OT, gross and taxable by the exact change and re-estimates tax and net', () => {
    const before = entry({ totalOtPay: 518.75 });
    const preview = previewOtBreakdown(breakdown(), { NORMAL: 6 });
    const after = entryWithOt(before, preview);
    const delta = 562.5;
    expect(after.totalOtPay).toBe(1081.25);
    expect(after.normalOtHours).toBe(10);
    expect(after.grossIncome).toBe(12_300 + delta);
    expect(after.taxableIncome).toBe(12_300 + delta);
    const taxDelta = estimateEthiopianTax(12_300 + delta) - estimateEthiopianTax(12_300);
    expect(after.netPay).toBeCloseTo(Number(before.netPay) + delta - taxDelta, 2);
    // Pension is on earned salary only.
    expect(after.pensionEmployee).toBe(before.pensionEmployee);
  });

  it('adds no tax when the entry is not taxed', () => {
    const before = entry({ incomeTax: 0, totalOtPay: 518.75 });
    const after = entryWithOt(before, previewOtBreakdown(breakdown(), { NORMAL: 2 }));
    expect(after.incomeTax).toBe(0);
    expect(after.netPay).toBeCloseTo(Number(before.netPay) + 187.5, 2);
  });
});

describe('entryWithTopUp', () => {
  it('adds a net top-up to net pay only', () => {
    const before = entry();
    const after = entryWithTopUp(before, 'net', 500, 'Hardship');
    expect(after.netPay).toBe(Number(before.netPay) + 500);
    expect(after.grossIncome).toBe(before.grossIncome);
    expect(after.netTopUp).toBe(500);
  });

  it('runs a taxable top-up through gross, taxable and tax', () => {
    const before = entry();
    const after = entryWithTopUp(before, 'taxable', 1000, 'Bonus');
    expect(after.grossIncome).toBe(13_300);
    expect(after.taxableIncome).toBe(13_300);
    expect(Number(after.incomeTax)).toBeGreaterThan(Number(before.incomeTax));
  });
});

describe('runWithEntry', () => {
  it('replaces the entry and recomputes the run totals', () => {
    const run = {
      entries: [entry(), entry({ id: 'e2', grossIncome: 5000, netPay: 4000 })],
    } as unknown as PayrollRunDetail;
    const next = runWithEntry(run, { id: 'e2', grossIncome: 6000, netPay: 4800 });
    expect(next.totalGross).toBe(12_300 + 6000);
    expect(next.totalNetPay).toBeCloseTo(Number(entry().netPay) + 4800, 2);
    expect(next.entries[1]!.grossIncome).toBe(6000);
  });
});
