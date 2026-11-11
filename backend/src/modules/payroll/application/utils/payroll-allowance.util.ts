import { PAYROLL_MONTH_DAYS } from './payroll-days.util';

export interface AllowanceContractSlice {
  transportationAllowance: number;
  monthlyBonus: number;
  /** Allocated payroll days for this contract period (30-day scale). */
  allocatedDays: number;
}

/**
 * Prorate transport and monthly-bonus allowances across one or more contract
 * periods in a month.
 *
 *   allowance = Σ (contractAmount × allocatedDays / 30)
 *
 * @param slices            Per-contract amounts and their allocated payroll days.
 * @param totalEmployedDays Sum of allocated days (before absence deductions).
 * @param payrollDays       Paid days after absences (used when reducedByAbsence).
 * @param noLeaverDays      Employed days as if the employee had NOT left mid-month.
 *                          Pass the same value as totalEmployedDays for non-leavers
 *                          and for joiners (no leaver adjustment needed).
 * @param leaverMode        'PRORATED': use allocated days as-is.
 *                          'FULL': scale allocated days up to noLeaverDays when
 *                          noLeaverDays > totalEmployedDays (leaver left early).
 * @param reducedByAbsence  When true, multiply the sum by payrollDays / totalEmployedDays.
 */
export function computeContractAllowances(
  slices: AllowanceContractSlice[],
  totalEmployedDays: number,
  payrollDays: number,
  noLeaverDays: number,
  leaverMode: 'PRORATED' | 'FULL',
  reducedByAbsence: boolean,
): { transport: number; monthlyBonus: number } {
  if (slices.length === 0 || totalEmployedDays <= 0) {
    return { transport: 0, monthlyBonus: 0 };
  }

  // FULL leaver mode: scale each contract's allocated days up proportionally so the
  // total reaches noLeaverDays (i.e. remove the leaver-end cut while keeping the
  // joiner-start cut).
  const leaverScale =
    leaverMode === 'FULL' && noLeaverDays > totalEmployedDays
      ? noLeaverDays / totalEmployedDays
      : 1;

  let transport = 0;
  let monthlyBonus = 0;

  for (const slice of slices) {
    const effectiveDays = slice.allocatedDays * leaverScale;
    transport +=
      (slice.transportationAllowance * effectiveDays) / PAYROLL_MONTH_DAYS;
    monthlyBonus +=
      (slice.monthlyBonus * effectiveDays) / PAYROLL_MONTH_DAYS;
  }

  // Absence reduction: replace employed-day denominator with paid days.
  if (reducedByAbsence && totalEmployedDays > 0) {
    const absenceScale = payrollDays / totalEmployedDays;
    transport *= absenceScale;
    monthlyBonus *= absenceScale;
  }

  return {
    transport: round2(transport),
    monthlyBonus: round2(monthlyBonus),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
