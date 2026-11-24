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

export type OtBreakdownPreview = PayrollOtBreakdown & {
  /** Selected contract’s live rows (for the spreadsheet grid). */
  contractCategories: PayrollOtBreakdown['categories'];
  /** Selected contract’s live pay totals. */
  contractTotals: PayrollOtBreakdown['totals'];
};

/**
 * Live OT figures while typing manual hours for one contract.
 * `categories` / `totals` are the employee roll-up (for entry patches);
 * `contractCategories` / `contractTotals` drive the grid for the selected contract.
 */
export function previewOtBreakdown(
  breakdown: PayrollOtBreakdown,
  hours: Partial<Record<PayrollOtCategory, number>>,
  contractId?: string | null,
): OtBreakdownPreview {
  const contracts = breakdown.contracts ?? [];
  const selected =
    (contractId ? contracts.find((c) => c.contractId === contractId) : null) ??
    contracts.find((c) => c.contractId === breakdown.defaultContractId) ??
    contracts[0] ??
    null;

  const sourceRows = selected?.categories ?? breakdown.categories;
  const rates = selected?.rates ?? breakdown.rates;

  const contractCategories = sourceRows.map((row) => {
    const manual = previewManualRow(
      row,
      hours[row.category] ?? 0,
      rates?.[row.category] ?? 0,
    );
    return {
      ...row,
      manualHours: manual.appliedHours,
      manualPay: manual.pay,
      totalHours: round2(row.systemHours + manual.appliedHours),
      totalPay: round2(row.systemPay + manual.pay),
    };
  });

  const sum = (
    rows: typeof contractCategories,
    pick: (c: (typeof contractCategories)[number]) => number,
  ): number => round2(rows.reduce((total, c) => total + pick(c), 0));

  const contractTotals = {
    systemPay: sum(contractCategories, (c) => c.systemPay),
    manualPay: sum(contractCategories, (c) => c.manualPay),
    totalPay: sum(contractCategories, (c) => c.totalPay),
  };

  const otherContracts = contracts.filter((c) => c.contractId !== selected?.contractId);
  const categories = (['NORMAL', 'EVENING', 'SUNDAY', 'HOLIDAY'] as const).map((category) => {
    const live = contractCategories.find((row) => row.category === category)!;
    const other = otherContracts.map(
      (c) => c.categories.find((row) => row.category === category)!,
    );
    const systemHours = round2(
      live.systemHours + other.reduce((s, row) => s + (row?.systemHours ?? 0), 0),
    );
    const systemPay = round2(
      live.systemPay + other.reduce((s, row) => s + (row?.systemPay ?? 0), 0),
    );
    const manualHours = round2(
      live.manualHours + other.reduce((s, row) => s + (row?.manualHours ?? 0), 0),
    );
    const manualPay = round2(
      live.manualPay + other.reduce((s, row) => s + (row?.manualPay ?? 0), 0),
    );
    return {
      category,
      systemHours,
      systemPay,
      manualHours,
      manualPay,
      totalHours: round2(systemHours + manualHours),
      totalPay: round2(systemPay + manualPay),
    };
  });

  const totals = {
    systemPay: sum(categories, (c) => c.systemPay),
    manualPay: sum(categories, (c) => c.manualPay),
    totalPay: sum(categories, (c) => c.totalPay),
  };

  return {
    ...breakdown,
    categories,
    totals,
    contractCategories,
    contractTotals,
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
