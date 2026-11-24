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
 * period from dated entries. Manual hours have no dates; HR assigns them to a
 * salary-period contract and they are priced on that period's basic:
 *
 *   total[category] = system[category] + manual[category]
 *
 * A negative adjustment can at most cancel the system hours of its category
 * on that same contract, so no bucket goes below zero.
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

/** One contract's system OT + basic + the manual rows for that contract. */
export interface ContractManualOtGroup {
  contractId: string;
  basicSalary: number;
  systemHours: OvertimeHoursBuckets;
  systemPay: Omit<OvertimePayAmounts, 'totalOtPay'>;
  adjustments: readonly ManualOtAdjustmentInput[];
}

export interface CombinedContractOvertime {
  hours: OvertimeHoursBuckets;
  pay: OvertimePayAmounts;
  /** What each contract's manual rows contributed (for storage / period updates). */
  appliedByContract: Array<{ contractId: string; applied: AppliedManualOt[] }>;
  /** System + manual totals per contract (for PayrollSalaryPeriod columns). */
  periodTotals: Array<{
    contractId: string;
    hours: OvertimeHoursBuckets;
    pay: OvertimePayAmounts;
  }>;
}

function emptyHours(): OvertimeHoursBuckets {
  return { normalHours: 0, eveningHours: 0, sundayHours: 0, holidayHours: 0 };
}

function emptyPay(): Omit<OvertimePayAmounts, 'totalOtPay'> {
  return { normalOtPay: 0, eveningOtPay: 0, sundayOtPay: 0, holidayOtPay: 0 };
}

/**
 * Prices manual OT per contract (each on its own basic), then sums into entry
 * totals. Period totals are system + that contract's manual.
 */
export function combineManualOvertimeByContracts(
  groups: readonly ContractManualOtGroup[],
  rates?: OvertimeRatePolicy,
): CombinedContractOvertime {
  const hours = emptyHours();
  const pay = emptyPay();
  const appliedByContract: CombinedContractOvertime['appliedByContract'] = [];
  const periodTotals: CombinedContractOvertime['periodTotals'] = [];

  for (const group of groups) {
    const combined = combineManualOvertime({
      systemHours: group.systemHours,
      systemPay: group.systemPay,
      adjustments: group.adjustments,
      basicSalary: group.basicSalary,
      rates,
    });
    for (const key of Object.keys(hours) as Array<keyof OvertimeHoursBuckets>) {
      hours[key] = round2(hours[key] + combined.hours[key]);
    }
    pay.normalOtPay = round2(pay.normalOtPay + combined.pay.normalOtPay);
    pay.eveningOtPay = round2(pay.eveningOtPay + combined.pay.eveningOtPay);
    pay.sundayOtPay = round2(pay.sundayOtPay + combined.pay.sundayOtPay);
    pay.holidayOtPay = round2(pay.holidayOtPay + combined.pay.holidayOtPay);
    appliedByContract.push({
      contractId: group.contractId,
      applied: combined.applied,
    });
    periodTotals.push({
      contractId: group.contractId,
      hours: combined.hours,
      pay: combined.pay,
    });
  }

  return {
    hours,
    pay: {
      ...pay,
      totalOtPay: round2(
        pay.normalOtPay + pay.eveningOtPay + pay.sundayOtPay + pay.holidayOtPay,
      ),
    },
    appliedByContract,
    periodTotals,
  };
}
