import type { PayrollOtCategory } from '@prisma/client';
import {
  calculateOvertimePay,
  type OvertimeHoursBuckets,
  type OvertimePayAmounts,
  type OvertimeRatePolicy,
} from './payroll-overtime.util';

/**
 * Manual (paper-based) OT adjustments on a payroll entry.
 *
 * System OT comes from approved overtime sheets and is priced per contract
 * period from dated entries. Manual hours have no dates, so they are priced on
 * the month-end basic with the policy rates (like undated sheet totals) and
 * added on top:
 *
 *   total[category] = system[category] + manual[category]
 *
 * A negative adjustment can at most cancel the system hours of its category,
 * so no bucket goes below zero.
 */

export const PAYROLL_OT_CATEGORIES: readonly PayrollOtCategory[] = [
  'NORMAL',
  'EVENING',
  'SUNDAY',
  'HOLIDAY',
];

type HoursKey = keyof OvertimeHoursBuckets;
type PayKey = Exclude<keyof OvertimePayAmounts, 'totalOtPay'>;

export const OT_CATEGORY_KEYS: Record<
  PayrollOtCategory,
  { hours: HoursKey; pay: PayKey }
> = {
  NORMAL: { hours: 'normalHours', pay: 'normalOtPay' },
  EVENING: { hours: 'eveningHours', pay: 'eveningOtPay' },
  SUNDAY: { hours: 'sundayHours', pay: 'sundayOtPay' },
  HOLIDAY: { hours: 'holidayHours', pay: 'holidayOtPay' },
};

export interface ManualOtAdjustmentInput {
  category: PayrollOtCategory;
  hours: number;
}

export interface AppliedManualOt {
  category: PayrollOtCategory;
  /** Hours actually added (after the no-negative-total clamp). */
  hours: number;
  /** OT pay actually added for those hours. */
  amount: number;
}

export interface CombinedOvertime {
  hours: OvertimeHoursBuckets;
  pay: OvertimePayAmounts;
  applied: AppliedManualOt[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** OT pay for `hours` of one category on `basicSalary`. */
export function manualOtPay(
  category: PayrollOtCategory,
  hours: number,
  basicSalary: number,
  rates?: OvertimeRatePolicy,
): number {
  const keys = OT_CATEGORY_KEYS[category];
  const buckets: OvertimeHoursBuckets = {
    normalHours: 0,
    eveningHours: 0,
    sundayHours: 0,
    holidayHours: 0,
    [keys.hours]: hours,
  };
  return calculateOvertimePay(basicSalary, buckets, rates)[keys.pay];
}

/**
 * Pay for one manual OT hour of a category (4 decimals). Lets the UI price
 * hours as they are typed; the server still prices the saved hours itself.
 */
export function manualOtHourlyRate(
  category: PayrollOtCategory,
  basicSalary: number,
  rates?: OvertimeRatePolicy,
): number {
  return Math.round(manualOtPay(category, 100, basicSalary, rates) * 100) / 10_000;
}

/**
 * System OT plus manual adjustments, per category. `applied` reports what each
 * adjustment contributed so it can be stored on the adjustment and later
 * subtracted exactly.
 */
export function combineManualOvertime(input: {
  systemHours: OvertimeHoursBuckets;
  systemPay: Omit<OvertimePayAmounts, 'totalOtPay'>;
  adjustments: readonly ManualOtAdjustmentInput[];
  basicSalary: number;
  rates?: OvertimeRatePolicy;
}): CombinedOvertime {
  const hours: OvertimeHoursBuckets = { ...input.systemHours };
  const pay = {
    normalOtPay: input.systemPay.normalOtPay,
    eveningOtPay: input.systemPay.eveningOtPay,
    sundayOtPay: input.systemPay.sundayOtPay,
    holidayOtPay: input.systemPay.holidayOtPay,
  };
  const applied: AppliedManualOt[] = [];

  for (const adjustment of input.adjustments) {
    const keys = OT_CATEGORY_KEYS[adjustment.category];
    const effectiveHours = round2(
      Math.max(adjustment.hours, -hours[keys.hours]),
    );
    const amount = round2(
      Math.max(
        manualOtPay(adjustment.category, effectiveHours, input.basicSalary, input.rates),
        -pay[keys.pay],
      ),
    );
    hours[keys.hours] = round2(hours[keys.hours] + effectiveHours);
    pay[keys.pay] = round2(pay[keys.pay] + amount);
    applied.push({ category: adjustment.category, hours: effectiveHours, amount });
  }

  return {
    hours,
    pay: {
      ...pay,
      totalOtPay: round2(
        pay.normalOtPay + pay.eveningOtPay + pay.sundayOtPay + pay.holidayOtPay,
      ),
    },
    applied,
  };
}

/** Removes previously applied manual OT from stored entry totals (exact). */
export function systemOvertimeFromEntry(input: {
  entryHours: OvertimeHoursBuckets;
  entryPay: Omit<OvertimePayAmounts, 'totalOtPay'>;
  stored: ReadonlyArray<{
    category: PayrollOtCategory;
    appliedHours: number;
    amount: number;
  }>;
}): { hours: OvertimeHoursBuckets; pay: Omit<OvertimePayAmounts, 'totalOtPay'> } {
  const hours: OvertimeHoursBuckets = { ...input.entryHours };
  const pay = { ...input.entryPay };
  for (const row of input.stored) {
    const keys = OT_CATEGORY_KEYS[row.category];
    hours[keys.hours] = round2(hours[keys.hours] - row.appliedHours);
    pay[keys.pay] = round2(pay[keys.pay] - row.amount);
  }
  return { hours, pay };
}
