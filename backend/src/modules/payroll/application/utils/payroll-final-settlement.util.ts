import type { PolicyValues } from '../../../../shared/policy/policy-definitions';

export type SettlementPolicy = Pick<
  PolicyValues,
  'unusedLeavePayout' | 'severancePay' | 'noticePay'
>;

export interface FinalSettlementInput {
  /** Basic salary of the contract in force on the leaving date. */
  basicSalary: number;
  leavingDate: Date;
  /** Start of the employment period that is ending (service years). */
  employmentStart: Date | null;
  /** Remaining annual leave days on the leaving date; null when not loaded. */
  unusedLeaveDays: number | null;
  policy: SettlementPolicy;
}

export interface FinalSettlementResult {
  /** True when at least one settlement item is enabled for the month. */
  anyEnabled: boolean;
  unusedLeavePayout: number;
  severancePay: number;
  noticePay: number;
  taxable: number;
  nonTaxable: number;
  notes: string[];
}

/**
 * Severance parameters (policy `severancePay.parameters`):
 * - monthsOfBasicPerYearOfService: months of basic paid per service year (required)
 * - maxMonths: cap on the total months paid (optional)
 * - minYearsOfService: no severance below this many service years (optional)
 * - taxable: whether severance is taxed (default true)
 */
interface SeveranceParameters {
  monthsOfBasicPerYearOfService?: number;
  maxMonths?: number;
  minYearsOfService?: number;
  taxable?: boolean;
}

const DAY_MS = 86_400_000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Annual-leave balance for the leave year containing the leaving date. */
export interface LeaveYearBalance {
  entitled: number;
  broughtForward: number;
  used: number;
  pending: number;
  remaining: number;
  /** Leave-year bounds, YYYY-MM-DD. */
  yearStart: string;
  yearEnd: string;
}

/**
 * Unused annual leave on the leaving date.
 * - prorate = false: the ledger's remaining balance (full-year entitlement).
 * - prorate = true: leave earned this year up to the leaving date
 *   (entitled × elapsed days / leave-year days) + brought forward − used − pending.
 *
 * TODO(HR, before enabling unusedLeavePayout): confirm (1) whether pending
 * requests are deducted, (2) rounding (2 decimals today vs. half days), and
 * (3) whether brought-forward days are paid in full. The feature is off by default.
 */
export function unusedLeaveDaysAtLeaving(
  balance: LeaveYearBalance,
  leavingDate: Date,
  prorate: boolean,
): number {
  if (!prorate) return Math.max(0, balance.remaining);
  const start = Date.parse(`${balance.yearStart}T00:00:00Z`);
  const end = Date.parse(`${balance.yearEnd}T00:00:00Z`);
  const yearDays = Math.round((end - start) / DAY_MS) + 1;
  const elapsed = Math.min(
    yearDays,
    Math.max(0, Math.round((leavingDate.getTime() - start) / DAY_MS) + 1),
  );
  const earned = yearDays > 0 ? (balance.entitled * elapsed) / yearDays : 0;
  return round2(Math.max(0, balance.broughtForward + earned - balance.used - balance.pending));
}

/** Service years (fractional, 365.25-day years) from start to the leaving date inclusive. */
export function serviceYears(start: Date | null, leavingDate: Date): number {
  if (!start) return 0;
  const days = Math.floor((leavingDate.getTime() - start.getTime()) / DAY_MS) + 1;
  return days > 0 ? days / 365.25 : 0;
}

/**
 * Final-settlement lines for a LEAVER_FINAL_MONTH entry. Each item is computed
 * only when enabled in the policy in force for the payroll month; disabled
 * items stay "handled outside the system".
 */
export function computeFinalSettlement(input: FinalSettlementInput): FinalSettlementResult {
  const { policy, basicSalary } = input;
  const dailyRate = basicSalary / 30;
  const notes: string[] = [];
  let taxable = 0;
  let nonTaxable = 0;

  let unusedLeavePayout = 0;
  if (policy.unusedLeavePayout.enabled) {
    if (input.unusedLeaveDays == null) {
      notes.push('Unused leave payout: balance unavailable - handled outside the system');
    } else {
      const days = Math.max(0, input.unusedLeaveDays);
      unusedLeavePayout = round2(days * dailyRate);
      taxable += unusedLeavePayout;
      notes.push(`Unused leave payout: ${days} day(s) × basic/30 = ${unusedLeavePayout.toFixed(2)}`);
    }
  }

  let severancePay = 0;
  if (policy.severancePay.enabled) {
    const params = (policy.severancePay.parameters ?? {}) as SeveranceParameters;
    const perYear = finiteNumber(params.monthsOfBasicPerYearOfService);
    const years = serviceYears(input.employmentStart, input.leavingDate);
    const minYears = finiteNumber(params.minYearsOfService) ?? 0;
    if (perYear == null) {
      notes.push(
        'Severance: parameters.monthsOfBasicPerYearOfService not set - handled outside the system',
      );
    } else if (years < minYears) {
      notes.push(`Severance: ${years.toFixed(2)} service year(s) below minimum ${minYears} - none`);
    } else {
      const maxMonths = finiteNumber(params.maxMonths);
      let months = perYear * years;
      if (maxMonths != null) months = Math.min(months, maxMonths);
      severancePay = round2(months * basicSalary);
      if (params.taxable === false) nonTaxable += severancePay;
      else taxable += severancePay;
      notes.push(
        `Severance: ${years.toFixed(2)} service year(s) × ${perYear} month(s)` +
          `${maxMonths != null ? ` (max ${maxMonths})` : ''} × basic = ${severancePay.toFixed(2)}` +
          `${params.taxable === false ? ' (not taxed)' : ''}`,
      );
    }
  }

  let noticePay = 0;
  if (policy.noticePay.enabled) {
    noticePay = round2(Math.max(0, policy.noticePay.days) * dailyRate);
    taxable += noticePay;
    notes.push(`Notice pay: ${policy.noticePay.days} day(s) × basic/30 = ${noticePay.toFixed(2)}`);
  }

  return {
    anyEnabled:
      policy.unusedLeavePayout.enabled || policy.severancePay.enabled || policy.noticePay.enabled,
    unusedLeavePayout,
    severancePay,
    noticePay,
    taxable: round2(taxable),
    nonTaxable: round2(nonTaxable),
    notes,
  };
}
