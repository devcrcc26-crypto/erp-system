import type { PayrollAdjustmentTotals } from '../services/payroll-calculation.service';

/** Built-in adjustment types that reuse an existing PayrollEntry field. */
export const ADJUSTMENT_SYSTEM_FIELD = {
  BONUS_TOP_UP: 'BONUS_TOP_UP',
  NET_TOP_UP: 'NET_TOP_UP',
} as const;

export type AdjustmentSystemField =
  (typeof ADJUSTMENT_SYSTEM_FIELD)[keyof typeof ADJUSTMENT_SYSTEM_FIELD];

/** Seeded adjustment type codes (migration 20261127120000). */
export const ADJUSTMENT_TYPE_CODE = {
  TAXABLE_BONUS: 'TAXABLE_BONUS',
  NET_BONUS: 'NET_BONUS',
  SEVERANCE_PAY: 'SEVERANCE_PAY',
  SALARY_ARREARS: 'SALARY_ARREARS',
  RECOVERY: 'RECOVERY',
  OTHER: 'OTHER',
} as const;

export interface AdjustmentLineForTotals {
  amount: number;
  kind: 'EARNING' | 'DEDUCTION';
  taxable: boolean;
  pensionable: boolean;
  systemField: string | null;
}

export interface AdjustmentLineTotals {
  /** Sum of Taxable bonus lines (stored in PayrollEntry.bonusTopUp). */
  bonusTopUp: number;
  /** Sum of Net bonus lines (stored in PayrollEntry.netTopUp). */
  netTopUp: number;
  /** Every other line, by tax treatment. */
  adjustments: PayrollAdjustmentTotals;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Splits an employee's adjustment lines into the inputs the payroll
 * calculation takes. Taxable / net bonus lines keep using the existing
 * bonusTopUp / netTopUp fields so their calculation is unchanged. A deduction
 * is always taken off net pay after tax, whatever its flags say.
 */
export function adjustmentTotalsFromLines(
  lines: readonly AdjustmentLineForTotals[],
): AdjustmentLineTotals {
  let bonusTopUp = 0;
  let netTopUp = 0;
  let taxableEarnings = 0;
  let nonTaxableEarnings = 0;
  let pensionableEarnings = 0;
  let deductions = 0;

  for (const line of lines) {
    const amount = Math.max(0, line.amount);
    if (line.systemField === ADJUSTMENT_SYSTEM_FIELD.BONUS_TOP_UP) {
      bonusTopUp += amount;
      continue;
    }
    if (line.systemField === ADJUSTMENT_SYSTEM_FIELD.NET_TOP_UP) {
      netTopUp += amount;
      continue;
    }
    if (line.kind === 'DEDUCTION') {
      deductions += amount;
      continue;
    }
    if (line.taxable) {
      taxableEarnings += amount;
    } else {
      nonTaxableEarnings += amount;
    }
    if (line.pensionable) {
      pensionableEarnings += amount;
    }
  }

  return {
    bonusTopUp: round2(bonusTopUp),
    netTopUp: round2(netTopUp),
    adjustments: {
      taxableEarnings: round2(taxableEarnings),
      nonTaxableEarnings: round2(nonTaxableEarnings),
      pensionableEarnings: round2(pensionableEarnings),
      deductions: round2(deductions),
    },
  };
}

/**
 * One third of the monthly wage: the most that may be deducted from an
 * employee's pay in one month (Ethiopian Labour Proclamation 1156/2019,
 * Art. 59). "Monthly wage" is the salary earned that month (prorated basic,
 * PayrollEntry.earnedSalary), not the contract basic. Statutory income tax
 * and pension are not counted against the cap - only deductions HR adds
 * (recovery / deduction lines).
 */
export function deductionCap(monthlyWage: number): number {
  return Math.floor((Math.max(0, monthlyWage) / 3) * 100) / 100;
}

/** True when the employee's deductions in a run exceed one third of the wage. */
export function exceedsDeductionCap(monthlyWage: number, deductions: number): boolean {
  return deductions > deductionCap(monthlyWage) + 0.005;
}

export interface RecoveryInstalmentSuggestion {
  /** Suggested amount for this run (0 when the cap is already used up). */
  amount: number;
  /** One third of the monthly wage. */
  cap: number;
  /** Cap left after deductions already in this run. */
  capRemaining: number;
  /** Instalments needed at this amount, including this one (null when amount is 0). */
  estimatedInstalments: number | null;
}

/**
 * Suggests how much of an amount owed to the company to recover in this run,
 * so the employee's deductions stay within one third of the monthly wage.
 */
export function suggestRecoveryInstalment(input: {
  monthlyWage: number;
  /** Deductions already in this run for the employee (excluding this one). */
  existingDeductions: number;
  /** Amount still owed on the reconciliation item. */
  remaining: number;
}): RecoveryInstalmentSuggestion {
  const cap = deductionCap(input.monthlyWage);
  const capRemaining = Math.max(0, round2(cap - Math.max(0, input.existingDeductions)));
  const remaining = Math.max(0, round2(input.remaining));
  const amount = Math.min(remaining, capRemaining);
  return {
    amount,
    cap,
    capRemaining,
    estimatedInstalments: amount > 0 ? Math.ceil(remaining / amount - 1e-9) : null,
  };
}

export type ReconciliationStatusValue = 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'WAIVED';

/** Status after a settlement change (WAIVED is set only by an explicit waive). */
export function reconciliationStatusFor(
  amount: number,
  settledAmount: number,
): Exclude<ReconciliationStatusValue, 'WAIVED'> {
  if (settledAmount <= 0.005) {
    return 'OPEN';
  }
  if (settledAmount + 0.005 >= amount) {
    return 'SETTLED';
  }
  return 'PARTIALLY_SETTLED';
}

/** Amount still owed on a reconciliation item. */
export function reconciliationRemaining(amount: number, settledAmount: number): number {
  return Math.max(0, round2(amount - settledAmount));
}

const LABEL_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Payslip / export label, e.g. "Recovery – October 2026 correction (1 of 3)". */
export function adjustmentLineLabel(input: {
  typeName: string;
  forMonth: number | null;
  forYear: number | null;
  instalmentNumber: number | null;
  instalmentCount: number | null;
}): string {
  if (input.forMonth == null || input.forYear == null) {
    return input.typeName;
  }
  const period = `${LABEL_MONTH_NAMES[input.forMonth - 1]} ${input.forYear} correction`;
  const instalment =
    input.instalmentNumber != null && input.instalmentCount != null && input.instalmentCount > 1
      ? ` (${input.instalmentNumber} of ${input.instalmentCount})`
      : '';
  return `${input.typeName} – ${period}${instalment}`;
}
