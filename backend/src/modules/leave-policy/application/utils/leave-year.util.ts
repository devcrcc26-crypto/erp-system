/**
 * Leave year = employment anniversary year (employmentDate), not contract start.
 * A leave year runs from the anniversary in year Y to the day before the
 * anniversary in Y+1, and is labelled Y. Without an employment date the
 * calendar year is used. Feb 29 anniversaries fall on Feb 28 in other years.
 */

export interface LeaveYear {
  /** Calendar year in which the leave year starts (leave_balance.year). */
  label: number;
  start: Date;
  /** Inclusive. */
  end: Date;
}

const DAY_MS = 86_400_000;

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function toDateOnlyUtc(value: Date): Date {
  return utcDate(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function dateOnlyKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Employment anniversary in `year` (Feb 29 → Feb 28 in non-leap years). */
export function anniversaryInYear(employmentDate: Date, year: number): Date {
  const month = employmentDate.getUTCMonth();
  const day = Math.min(employmentDate.getUTCDate(), lastDayOfMonth(year, month));
  return utcDate(year, month, day);
}

export function leaveYearByLabel(
  employmentDate: Date | null | undefined,
  label: number,
): LeaveYear {
  if (!employmentDate) {
    return { label, start: utcDate(label, 0, 1), end: utcDate(label, 11, 31) };
  }
  const start = anniversaryInYear(employmentDate, label);
  const next = anniversaryInYear(employmentDate, label + 1);
  return { label, start, end: new Date(next.getTime() - DAY_MS) };
}

/** Leave year containing `date`. */
export function leaveYearFor(
  employmentDate: Date | null | undefined,
  date: Date,
): LeaveYear {
  const day = toDateOnlyUtc(date);
  const year = day.getUTCFullYear();
  if (!employmentDate) {
    return leaveYearByLabel(null, year);
  }
  const thisYear = anniversaryInYear(employmentDate, year);
  return leaveYearByLabel(
    employmentDate,
    day.getTime() >= thisYear.getTime() ? year : year - 1,
  );
}

/** Full years of service at `at` (0 before the first anniversary). */
export function fullServiceYears(
  employmentDate: Date | null | undefined,
  at: Date,
): number {
  if (!employmentDate) {
    return 0;
  }
  const day = toDateOnlyUtc(at);
  let years = day.getUTCFullYear() - employmentDate.getUTCFullYear();
  if (day.getTime() < anniversaryInYear(employmentDate, day.getUTCFullYear()).getTime()) {
    years -= 1;
  }
  return Math.max(0, years);
}

/**
 * True when `date` is an employment anniversary after the hire date itself
 * (a renewal that starts a new leave year).
 */
export function isEmploymentAnniversary(
  employmentDate: Date | null | undefined,
  date: Date,
): boolean {
  if (!employmentDate) {
    return false;
  }
  const day = toDateOnlyUtc(date);
  if (day.getUTCFullYear() <= employmentDate.getUTCFullYear()) {
    return false;
  }
  return (
    day.getTime() === anniversaryInYear(employmentDate, day.getUTCFullYear()).getTime()
  );
}

export interface CarryOverPlan {
  /** Days moved into the new leave year (CARRY_OVER +). */
  carriedIn: number;
  /** Days that lapse in the previous leave year (EXPIRED −). */
  expired: number;
}

/**
 * Closing the previous leave year: unused days up to the policy cap carry
 * over; anything beyond the cap expires. A null cap carries everything.
 * Negative balances carry nothing and expire nothing.
 */
export function planCarryOver(
  previousRemaining: number,
  maxCarryForwardDays: number | null,
): CarryOverPlan {
  const unused = roundDays(Math.max(0, previousRemaining));
  const cap = maxCarryForwardDays == null ? unused : Math.max(0, maxCarryForwardDays);
  const carriedIn = roundDays(Math.min(unused, cap));
  return { carriedIn, expired: roundDays(unused - carriedIn) };
}

/** Rounds to one decimal (ledger precision). */
export function roundDays(value: number): number {
  return Math.round(value * 10) / 10;
}
