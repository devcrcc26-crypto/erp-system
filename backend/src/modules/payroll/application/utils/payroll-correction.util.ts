/**
 * Line-by-line comparison for correction runs: every payroll component of an
 * employee's entry, as paid and as corrected.
 */

/** Component keys in display order. */
export const CORRECTION_COMPONENTS = [
  'EARNED_SALARY',
  'ABSENCE_DEDUCTION',
  'NORMAL_OT',
  'EVENING_OT',
  'SUNDAY_OT',
  'HOLIDAY_OT',
  'MANUAL_OT_ADJUSTMENT',
  'TRANSPORT_ALLOWANCE',
  'MONTHLY_BONUS',
  'TAXABLE_BONUS',
  'NET_BONUS',
  'FINAL_SETTLEMENT',
  'ADJUSTMENT_TAXABLE',
  'ADJUSTMENT_NON_TAXABLE',
  'ADJUSTMENT_DEDUCTIONS',
  'GROSS',
  'TAXABLE_INCOME',
  'PENSION_EMPLOYEE',
  'PENSION_EMPLOYER',
  'INCOME_TAX',
  'NET_PAY',
] as const;

export type CorrectionComponent = (typeof CORRECTION_COMPONENTS)[number];

type Numeric = number | string | { toString(): string } | null | undefined;

/** The PayrollEntry fields the comparison reads. */
export interface CorrectionEntrySnapshot {
  basicSalary: Numeric;
  employedDays: Numeric;
  earnedSalary: Numeric;
  normalOtPay: Numeric;
  eveningOtPay: Numeric;
  sundayOtPay: Numeric;
  holidayOtPay: Numeric;
  transportAllowance: Numeric;
  monthlyBonus: Numeric;
  bonusTopUp: Numeric;
  contractNetBonus: Numeric;
  netTopUp: Numeric;
  unusedLeavePayout: Numeric;
  severancePay: Numeric;
  noticePay: Numeric;
  adjustmentTaxable: Numeric;
  adjustmentNonTaxable: Numeric;
  adjustmentDeductions: Numeric;
  grossIncome: Numeric;
  taxableIncome: Numeric;
  pensionEmployee: Numeric;
  pensionEmployer: Numeric;
  incomeTax: Numeric;
  netPay: Numeric;
}

/** Manual (paper) OT pay included in the entry's OT, by category. */
export interface ManualOtPayByCategory {
  NORMAL: number;
  EVENING: number;
  SUNDAY: number;
  HOLIDAY: number;
}

export const ZERO_MANUAL_OT: ManualOtPayByCategory = {
  NORMAL: 0,
  EVENING: 0,
  SUNDAY: 0,
  HOLIDAY: 0,
};

const num = (value: Numeric): number => {
  if (value == null || value === '') {
    return 0;
  }
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Amount per component. OT categories show system OT only; manual OT
 * adjustments are their own line, so the OT lines add up to total OT pay.
 * ABSENCE_DEDUCTION is month-end basic for the employed days minus earned
 * salary (absence, unpaid leave and unpaid inactive days), shown as a
 * positive amount.
 */
export function correctionComponentAmounts(
  entry: CorrectionEntrySnapshot | null,
  manualOt: ManualOtPayByCategory = ZERO_MANUAL_OT,
): Record<CorrectionComponent, number> {
  if (!entry) {
    return Object.fromEntries(CORRECTION_COMPONENTS.map((c) => [c, 0])) as Record<
      CorrectionComponent,
      number
    >;
  }
  const fullEarned = round2((num(entry.basicSalary) / 30) * num(entry.employedDays));
  const earned = num(entry.earnedSalary);
  const manualTotal = manualOt.NORMAL + manualOt.EVENING + manualOt.SUNDAY + manualOt.HOLIDAY;
  return {
    EARNED_SALARY: round2(earned),
    ABSENCE_DEDUCTION: round2(Math.max(0, fullEarned - earned)),
    NORMAL_OT: round2(num(entry.normalOtPay) - manualOt.NORMAL),
    EVENING_OT: round2(num(entry.eveningOtPay) - manualOt.EVENING),
    SUNDAY_OT: round2(num(entry.sundayOtPay) - manualOt.SUNDAY),
    HOLIDAY_OT: round2(num(entry.holidayOtPay) - manualOt.HOLIDAY),
    MANUAL_OT_ADJUSTMENT: round2(manualTotal),
    TRANSPORT_ALLOWANCE: round2(num(entry.transportAllowance)),
    MONTHLY_BONUS: round2(num(entry.monthlyBonus)),
    TAXABLE_BONUS: round2(num(entry.bonusTopUp)),
    NET_BONUS: round2(num(entry.contractNetBonus) + num(entry.netTopUp)),
    FINAL_SETTLEMENT: round2(
      num(entry.unusedLeavePayout) + num(entry.severancePay) + num(entry.noticePay),
    ),
    ADJUSTMENT_TAXABLE: round2(num(entry.adjustmentTaxable)),
    ADJUSTMENT_NON_TAXABLE: round2(num(entry.adjustmentNonTaxable)),
    ADJUSTMENT_DEDUCTIONS: round2(num(entry.adjustmentDeductions)),
    GROSS: round2(num(entry.grossIncome)),
    TAXABLE_INCOME: round2(num(entry.taxableIncome)),
    PENSION_EMPLOYEE: round2(num(entry.pensionEmployee)),
    PENSION_EMPLOYER: round2(num(entry.pensionEmployer)),
    INCOME_TAX: round2(num(entry.incomeTax)),
    NET_PAY: round2(num(entry.netPay)),
  };
}

export interface CorrectionLineDraft {
  component: CorrectionComponent;
  sortOrder: number;
  paidAmount: number;
  correctedAmount: number;
  difference: number;
}

/** One line per component: paid, corrected and corrected - paid. */
export function buildCorrectionLines(
  paid: Record<CorrectionComponent, number>,
  corrected: Record<CorrectionComponent, number>,
): CorrectionLineDraft[] {
  return CORRECTION_COMPONENTS.map((component, index) => ({
    component,
    sortOrder: index,
    paidAmount: paid[component],
    correctedAmount: corrected[component],
    difference: round2(corrected[component] - paid[component]),
  }));
}
