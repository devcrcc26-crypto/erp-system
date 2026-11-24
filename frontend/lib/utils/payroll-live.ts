import type {
  PayrollEntryDetail,
  PayrollOtBreakdown,
  PayrollOtCategory,
  PayrollRunDetail,
} from '@/lib/api/payroll.types';
import { parsePayrollMoney } from '@/lib/utils/payroll-display';
import { estimateEthiopianTax } from '@/lib/utils/payroll-entry-detail';

/**
 * Instant ("spreadsheet") payroll figures while HR edits, before the server
 * answers. OT pay and gross / taxable income change by exactly the amount
 * added (pension is on earned salary only, so it never moves here); income
 * tax is estimated with the standard brackets. The server's figures replace
 * these as soon as the save returns.
 */

const OT_FIELDS: Record<
  PayrollOtCategory,
  { hours: keyof PayrollEntryDetail; pay: keyof PayrollEntryDetail }
> = {
  NORMAL: { hours: 'normalOtHours', pay: 'normalOtPay' },
  EVENING: { hours: 'eveningOtHours', pay: 'eveningOtPay' },
  SUNDAY: { hours: 'sundayOtHours', pay: 'sundayOtPay' },
  HOLIDAY: { hours: 'holidayOtHours', pay: 'holidayOtPay' },
};

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Manual hours actually applied: a negative row can only cancel system hours. */
export function previewManualRow(
  row: { systemHours: number; systemPay: number },
  hours: number,
  rate: number,
): { appliedHours: number; pay: number } {
  const appliedHours = round2(Math.max(hours, -row.systemHours));
  const pay = round2(Math.max(appliedHours * rate, -row.systemPay));
  return { appliedHours, pay };
}

/** The OT breakdown as it will look with these manual hours (empty = none). */
export function previewOtBreakdown(
  breakdown: PayrollOtBreakdown,
  hours: Partial<Record<PayrollOtCategory, number>>,
): PayrollOtBreakdown {
  const categories = breakdown.categories.map((row) => {
    const manual = previewManualRow(
      row,
      hours[row.category] ?? 0,
      breakdown.rates?.[row.category] ?? 0,
    );
    return {
      ...row,
      manualHours: manual.appliedHours,
      manualPay: manual.pay,
      totalHours: round2(row.systemHours + manual.appliedHours),
      totalPay: round2(row.systemPay + manual.pay),
    };
  });
  const sum = (pick: (c: (typeof categories)[number]) => number): number =>
    round2(categories.reduce((total, c) => total + pick(c), 0));
  return {
    ...breakdown,
    categories,
    totals: {
      systemPay: sum((c) => c.systemPay),
      manualPay: sum((c) => c.manualPay),
      totalPay: sum((c) => c.totalPay),
    },
  };
}

/** Tax change from a change in taxable income (0 when the entry pays no tax). */
export function estimateTaxDelta(entry: PayrollEntryDetail, taxableDelta: number): number {
  const taxable = parsePayrollMoney(entry.taxableIncome);
  const tax = parsePayrollMoney(entry.incomeTax);
  // Above the zero bracket but no tax: the contract is not taxed.
  if (tax === 0 && taxable > 2000) {
    return 0;
  }
  return round2(estimateEthiopianTax(taxable + taxableDelta) - estimateEthiopianTax(taxable));
}

/** Re-derives the taxable / gross / tax / net chain after a taxable change. */
function withTaxableChange(
  entry: PayrollEntryDetail,
  delta: number,
): Partial<PayrollEntryDetail> {
  const taxDelta = estimateTaxDelta(entry, delta);
  return {
    grossIncome: round2(parsePayrollMoney(entry.grossIncome) + delta),
    taxableIncome: round2(parsePayrollMoney(entry.taxableIncome) + delta),
    incomeTax: round2(parsePayrollMoney(entry.incomeTax) + taxDelta),
    totalDeductions: round2(parsePayrollMoney(entry.totalDeductions) + taxDelta),
    netPay: round2(parsePayrollMoney(entry.netPay) + delta - taxDelta),
  };
}

/** Entry figures with the OT of `breakdown` (system + manual) applied. */
export function entryWithOt(
  entry: PayrollEntryDetail,
  breakdown: PayrollOtBreakdown,
): PayrollEntryDetail {
  const patch: Record<string, number> = {};
  for (const row of breakdown.categories) {
    const fields = OT_FIELDS[row.category];
    patch[fields.hours] = row.totalHours;
    patch[fields.pay] = row.totalPay;
  }
  const newTotal = breakdown.totals.totalPay;
  const delta = round2(newTotal - parsePayrollMoney(entry.totalOtPay));
  return {
    ...entry,
    ...(patch as Partial<PayrollEntryDetail>),
    totalOtPay: newTotal,
    ...withTaxableChange(entry, delta),
  };
}

/** Entry figures with a new taxable bonus top-up or net top-up. */
export function entryWithTopUp(
  entry: PayrollEntryDetail,
  kind: 'taxable' | 'net',
  amount: number,
  reason: string | null,
): PayrollEntryDetail {
  if (kind === 'taxable') {
    const delta = round2(amount - parsePayrollMoney(entry.bonusTopUp));
    return {
      ...entry,
      bonusTopUp: amount,
      bonusTopUpReason: reason,
      ...withTaxableChange(entry, delta),
    };
  }
  const delta = round2(amount - parsePayrollMoney(entry.netTopUp));
  return {
    ...entry,
    netTopUp: amount,
    netTopUpReason: reason,
    netPay: round2(parsePayrollMoney(entry.netPay) + delta),
  };
}

/** Run header totals recomputed from its entries (same sums as the server). */
export function runWithEntry(
  run: PayrollRunDetail,
  entry: Partial<PayrollEntryDetail> & { id: string },
): PayrollRunDetail {
  const entries = run.entries.map((row) => (row.id === entry.id ? { ...row, ...entry } : row));
  const sum = (pick: (row: PayrollEntryDetail) => number): number =>
    round2(entries.reduce((total, row) => total + pick(row), 0));
  return {
    ...run,
    entries,
    totalGross: sum((row) => parsePayrollMoney(row.grossIncome)),
    totalNetPay: sum((row) => parsePayrollMoney(row.netPay)),
    totalNetBonus: sum(
      (row) => parsePayrollMoney(row.contractNetBonus) + parsePayrollMoney(row.netTopUp),
    ),
    totalPensionEmp: sum((row) => parsePayrollMoney(row.pensionEmployee)),
    totalPensionEmr: sum((row) => parsePayrollMoney(row.pensionEmployer)),
    totalTax: sum((row) => parsePayrollMoney(row.incomeTax)),
  };
}
