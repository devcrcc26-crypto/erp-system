/**
 * Assign dated overtime entries to salary periods and price them from each
 * period's contractual basic (÷192, holiday ÷196).
 *
 * Overnight: OvertimeEntry stores one row with `date` = start day and combined
 * hour buckets (classification already spans midnight). Hours are not split
 * into separate calendar-day entries, so payroll assigns overnight OT by the
 * entry's start date ({@link OVERNIGHT_OT_DATE_ASSIGNMENT}).
 *
 * Payroll generate/recalculate must price from entry start/end times (exact
 * minutes via {@link datedEntriesFromExactMinutes}), not from stored Decimal(5,2)
 * hour columns - those are display-rounded and drift pay (e.g. 20h10m → 20.17).
 */

import {
  calculateOvertimeHours,
  type OvertimeDayContext,
} from '../../../overtime/application/utils/overtime-hours.util';
import { END_OF_DAY_HHMM } from '../../../overtime/application/utils/overtime-selectable-windows.util';
import {
  POLICY_DEFAULTS,
  type PolicyValues,
} from '../../../../shared/policy/policy-definitions';

export const OVERNIGHT_OT_DATE_ASSIGNMENT = 'START_DATE' as const;

export const OT_FALLBACK_MONTH_END_NOTE =
  'Overtime rate from month-end contract (no dated entries)';

export interface OvertimeHoursBuckets {
  normalHours: number;
  eveningHours: number;
  sundayHours: number;
  holidayHours: number;
}

export interface OvertimePayAmounts {
  normalOtPay: number;
  eveningOtPay: number;
  sundayOtPay: number;
  holidayOtPay: number;
  totalOtPay: number;
}

export interface DatedOvertimeEntry {
  date: Date;
  isOvernight: boolean;
  normalHours: number;
  eveningHours: number;
  sundayHours: number;
  holidayHours: number;
}

/** Weekday row from the employee's active work schedule. */
export interface OvertimeWeekdaySlice {
  isWorkingDay: boolean;
  isHalfDay: boolean;
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
}

export interface TimedOvertimeEntryInput {
  date: Date;
  startTime: string;
  endTime: string;
  isOvernight: boolean;
  context: OvertimeDayContext;
  nextDayContext?: OvertimeDayContext;
}

export interface SalaryPeriodWindow {
  contractId: string;
  periodStart: Date;
  periodEnd: Date;
  basicSalary: number;
}

export interface PeriodOvertimeResult extends OvertimeHoursBuckets, OvertimePayAmounts {
  contractId: string;
  periodStart: Date;
  periodEnd: Date;
  basicSalary: number;
}

export interface AssignedOvertimeResult {
  periods: PeriodOvertimeResult[];
  totals: OvertimeHoursBuckets & OvertimePayAmounts;
  /** True when sheet totals were used with month-end basic (no dated entries). */
  usedMonthEndFallback: boolean;
}

const ZERO_HOURS: OvertimeHoursBuckets = {
  normalHours: 0,
  eveningHours: 0,
  sundayHours: 0,
  holidayHours: 0,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toDateOnlyUtc(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function dateInInclusiveRange(date: Date, start: Date, end: Date): boolean {
  const d = toDateOnlyUtc(date).getTime();
  return d >= toDateOnlyUtc(start).getTime() && d <= toDateOnlyUtc(end).getTime();
}

/**
 * Sum hour buckets without intermediate rounding. Rounding hour totals before
 * pay (e.g. 20+10/60 → 20.17) drifts OT pay vs HR's minute-precise sheet.
 * Pay is still round2'd in {@link calculateOvertimePay}; hour display is
 * rounded when building returned totals.
 */
function addHours(
  a: OvertimeHoursBuckets,
  b: OvertimeHoursBuckets,
): OvertimeHoursBuckets {
  return {
    normalHours: a.normalHours + b.normalHours,
    eveningHours: a.eveningHours + b.eveningHours,
    sundayHours: a.sundayHours + b.sundayHours,
    holidayHours: a.holidayHours + b.holidayHours,
  };
}

function roundHoursBuckets(h: OvertimeHoursBuckets): OvertimeHoursBuckets {
  return {
    normalHours: round2(h.normalHours),
    eveningHours: round2(h.eveningHours),
    sundayHours: round2(h.sundayHours),
    holidayHours: round2(h.holidayHours),
  };
}

function hasHours(h: OvertimeHoursBuckets): boolean {
  return (
    h.normalHours > 0 ||
    h.eveningHours > 0 ||
    h.sundayHours > 0 ||
    h.holidayHours > 0
  );
}

/**
 * Format a Prisma TIME / Date as HH:mm (UTC).
 */
export function formatOvertimeTimeHhMm(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getUTCHours().toString().padStart(2, '0')}:${date
    .getUTCMinutes()
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Resolve end-time label for classification (24:00 when endsAtEndOfDay).
 */
export function overtimeEndTimeLabel(
  endTime: Date | string,
  endsAtEndOfDay: boolean,
  isOvernight: boolean,
): string {
  if (endsAtEndOfDay) {
    return END_OF_DAY_HHMM;
  }
  const label = formatOvertimeTimeHhMm(endTime);
  if (!isOvernight && label === '00:00') {
    return END_OF_DAY_HHMM;
  }
  return label;
}

/**
 * Build day context for OT classification from a schedule weekday + holiday flag.
 * `scheduledHoursClaimable`: the calendar day is under an approved site
 * assignment, so scheduled duty hours count as OT when reproducing buckets.
 */
export function buildOvertimeDayContext(
  weekday: OvertimeWeekdaySlice | undefined,
  isHoliday: boolean,
  lunchCountsAsOvertime: boolean = POLICY_DEFAULTS.lunchCountsAsOvertime,
  scheduledHoursClaimable = false,
): OvertimeDayContext {
  const isWorkingDay = Boolean(weekday?.isWorkingDay);
  const isHalfDay = Boolean(weekday?.isWorkingDay && weekday?.isHalfDay);
  return {
    lunchCountsAsOvertime,
    scheduledHoursClaimable,
    isHoliday,
    isWorkingDay,
    isHalfDay,
    morningStart: weekday?.morningStart ?? null,
    morningEnd: weekday?.morningEnd ?? null,
    afternoonStart:
      isWorkingDay && !isHalfDay ? weekday?.afternoonStart ?? null : null,
    afternoonEnd:
      isWorkingDay && !isHalfDay ? weekday?.afternoonEnd ?? null : null,
  };
}

/**
 * Classify one entry from start/end times with minute precision (no 2-decimal
 * rounding). Used by payroll generate/recalculate.
 */
export function datedEntryFromExactMinutes(
  input: TimedOvertimeEntryInput,
): DatedOvertimeEntry {
  const raw = calculateOvertimeHours(
    input.date,
    input.startTime,
    input.endTime,
    input.context,
    input.isOvernight,
    input.nextDayContext,
    { round: false },
  );
  return {
    date: input.date,
    isOvernight: input.isOvernight,
    normalHours: raw.regularHours,
    eveningHours: raw.nightHours,
    sundayHours: raw.weekendHours,
    holidayHours: raw.holidayHours,
  };
}

/**
 * Map timed entries to dated hour buckets using exact minutes.
 */
export function datedEntriesFromExactMinutes(
  entries: TimedOvertimeEntryInput[],
): DatedOvertimeEntry[] {
  return entries.map(datedEntryFromExactMinutes);
}

export type OvertimeRatePolicy = Pick<
  PolicyValues,
  'hoursDivisor' | 'holidayHoursDivisor' | 'multipliers'
>;

/**
 * OT pay from contractual basic ÷ hoursDivisor (holiday ÷ holidayHoursDivisor) × hours × multiplier.
 */
export function calculateOvertimePay(
  basicSalary: number,
  hours: OvertimeHoursBuckets,
  rates: OvertimeRatePolicy = POLICY_DEFAULTS,
): OvertimePayAmounts {
  const hourlyBase = basicSalary / rates.hoursDivisor;
  const holidayHourlyBase = basicSalary / rates.holidayHoursDivisor;
  const m = rates.multipliers;
  const normalOtPay = round2(hourlyBase * hours.normalHours * m.regular);
  const eveningOtPay = round2(hourlyBase * hours.eveningHours * m.night);
  const sundayOtPay = round2(hourlyBase * hours.sundayHours * m.weekend);
  const holidayOtPay = round2(holidayHourlyBase * hours.holidayHours * m.holiday);
  return {
    normalOtPay,
    eveningOtPay,
    sundayOtPay,
    holidayOtPay,
    totalOtPay: round2(
      normalOtPay + eveningOtPay + sundayOtPay + holidayOtPay,
    ),
  };
}

function emptyPeriodResult(period: SalaryPeriodWindow): PeriodOvertimeResult {
  const pay = calculateOvertimePay(period.basicSalary, ZERO_HOURS);
  return {
    contractId: period.contractId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    basicSalary: period.basicSalary,
    ...ZERO_HOURS,
    ...pay,
  };
}

/**
 * Assign each dated OT entry to the salary period covering its date, price with
 * that period's basic, and sum hours/pay for the payroll entry.
 *
 * When `entries` is empty but `sheetTotals` has hours, falls back to month-end
 * basic (last period) for all hours.
 */
export function assignOvertimeToSalaryPeriods(input: {
  entries: DatedOvertimeEntry[];
  periods: SalaryPeriodWindow[];
  sheetTotals?: OvertimeHoursBuckets | null;
  /** Basic used when there is a single period or for fallback. */
  monthEndBasic: number;
  /** Divisors / multipliers in force for the payroll month (default: code defaults). */
  rates?: OvertimeRatePolicy;
}): AssignedOvertimeResult {
  const { entries, periods, sheetTotals, monthEndBasic, rates = POLICY_DEFAULTS } = input;

  if (periods.length === 0) {
    const hours = sheetTotals ?? ZERO_HOURS;
    const pay = calculateOvertimePay(monthEndBasic, hours, rates);
    return {
      periods: [],
      totals: { ...hours, ...pay },
      usedMonthEndFallback: hasHours(hours),
    };
  }

  const datedWithHours = entries.filter((e) =>
    hasHours({
      normalHours: e.normalHours,
      eveningHours: e.eveningHours,
      sundayHours: e.sundayHours,
      holidayHours: e.holidayHours,
    }),
  );

  if (datedWithHours.length === 0) {
    const hours = sheetTotals ?? ZERO_HOURS;
    if (!hasHours(hours)) {
      return {
        periods: periods.map(emptyPeriodResult),
        totals: { ...ZERO_HOURS, ...calculateOvertimePay(monthEndBasic, ZERO_HOURS) },
        usedMonthEndFallback: false,
      };
    }
    // Fallback: all sheet totals priced on month-end contract.
    const pay = calculateOvertimePay(monthEndBasic, hours, rates);
    const last = periods[periods.length - 1]!;
    const periodResults = periods.map((p, index) => {
      if (index === periods.length - 1) {
        return {
          contractId: p.contractId,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          basicSalary: p.basicSalary,
          ...hours,
          ...pay,
        };
      }
      return emptyPeriodResult(p);
    });
    void last;
    return {
      periods: periodResults,
      totals: { ...hours, ...pay },
      usedMonthEndFallback: true,
    };
  }

  const periodHours = periods.map(() => ({ ...ZERO_HOURS }));

  for (const entry of datedWithHours) {
    // Overnight: use start date (hours not stored per calendar day).
    const assignDate = toDateOnlyUtc(entry.date);
    let periodIndex = periods.findIndex((p) =>
      dateInInclusiveRange(assignDate, p.periodStart, p.periodEnd),
    );
    if (periodIndex < 0) {
      // Outside all windows - attach to nearest period by start date.
      periodIndex = 0;
      for (let i = 0; i < periods.length; i += 1) {
        if (assignDate.getTime() >= toDateOnlyUtc(periods[i]!.periodStart).getTime()) {
          periodIndex = i;
        }
      }
    }
    periodHours[periodIndex] = addHours(periodHours[periodIndex]!, {
      normalHours: entry.normalHours,
      eveningHours: entry.eveningHours,
      sundayHours: entry.sundayHours,
      holidayHours: entry.holidayHours,
    });
  }

  const periodResults: PeriodOvertimeResult[] = periods.map((p, i) => {
    const hours = periodHours[i]!;
    const pay = calculateOvertimePay(p.basicSalary, hours, rates);
    return {
      contractId: p.contractId,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      basicSalary: p.basicSalary,
      ...roundHoursBuckets(hours),
      ...pay,
    };
  });

  const totalsHours = roundHoursBuckets(
    periodHours.reduce((acc, h) => addHours(acc, h), { ...ZERO_HOURS }),
  );
  const totalsPay: OvertimePayAmounts = {
    normalOtPay: round2(
      periodResults.reduce((s, p) => s + p.normalOtPay, 0),
    ),
    eveningOtPay: round2(
      periodResults.reduce((s, p) => s + p.eveningOtPay, 0),
    ),
    sundayOtPay: round2(
      periodResults.reduce((s, p) => s + p.sundayOtPay, 0),
    ),
    holidayOtPay: round2(
      periodResults.reduce((s, p) => s + p.holidayOtPay, 0),
    ),
    totalOtPay: 0,
  };
  totalsPay.totalOtPay = round2(
    totalsPay.normalOtPay +
      totalsPay.eveningOtPay +
      totalsPay.sundayOtPay +
      totalsPay.holidayOtPay,
  );

  return {
    periods: periodResults,
    totals: { ...totalsHours, ...totalsPay },
    usedMonthEndFallback: false,
  };
}
