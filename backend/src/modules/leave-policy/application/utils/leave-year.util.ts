/**
 * Leave year = employment anniversary year (employmentDate), not contract start.
 * A leave year runs from the anniversary in year Y to the day before the
 * anniversary in Y+1, and is labelled Y. Without an employment date the
 * calendar year is used. Feb 29 anniversaries fall on Feb 28 in other years.
 *
 * All civil dates are interpreted in Africa/Addis_Ababa and compared as
 * YYYY-MM-DD strings — never as timestamps.
 */

export const LEAVE_YEAR_TIMEZONE = 'Africa/Addis_Ababa';

export interface LeaveYear {
  /** Calendar year in which the leave year starts (leave_balance.year). */
  label: number;
  /** UTC midnight of the civil start date (YYYY-MM-DD in Addis). */
  start: Date;
  /** Inclusive UTC midnight of the civil end date. */
  end: Date;
}

const DAY_MS = 86_400_000;

const addisDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: LEAVE_YEAR_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Civil YYYY-MM-DD in Africa/Addis_Ababa for any Date / timestamptz.
 */
export function toDateOnlyKey(
  value: Date | string,
  timeZone: string = LEAVE_YEAR_TIMEZONE,
): string {
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (match) {
      return match[1]!;
    }
    return toDateOnlyKey(new Date(value), timeZone);
  }
  if (timeZone === LEAVE_YEAR_TIMEZONE) {
    return addisDateFormatter.format(value);
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

/** Parse YYYY-MM-DD into a UTC-midnight Date suitable for Prisma `@db.Date`. */
export function parseDateOnlyKey(key: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) {
    throw new Error(`Invalid date-only key: ${key}`);
  }
  return utcDate(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
}

/** Normalize any Date / string to UTC midnight of its Addis civil date. */
export function toDateOnlyUtc(value: Date | string): Date {
  return parseDateOnlyKey(toDateOnlyKey(value));
}

/** @deprecated Prefer toDateOnlyKey — kept for existing call sites. */
export function dateOnlyKey(value: Date): string {
  return toDateOnlyKey(value);
}

export function compareDateOnlyKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Employment anniversary in `year` (Feb 29 → Feb 28 in non-leap years). */
export function anniversaryInYear(employmentDate: Date, year: number): Date {
  const key = toDateOnlyKey(employmentDate);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) {
    throw new Error(`Invalid employment date key: ${key}`);
  }
  const month = Number(match[2]) - 1;
  const day = Math.min(Number(match[3]), lastDayOfMonth(year, month));
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

/** Leave year containing `date` (Addis civil date). */
export function leaveYearFor(
  employmentDate: Date | null | undefined,
  date: Date | string,
): LeaveYear {
  const dayKey = toDateOnlyKey(date);
  const year = Number(dayKey.slice(0, 4));
  if (!employmentDate) {
    return leaveYearByLabel(null, year);
  }
  const thisYearKey = toDateOnlyKey(anniversaryInYear(employmentDate, year));
  return leaveYearByLabel(
    employmentDate,
    compareDateOnlyKeys(dayKey, thisYearKey) >= 0 ? year : year - 1,
  );
}

/**
 * Split an inclusive date range into segments that each lie in a single leave year.
 */
export function splitRangeByLeaveYears(
  employmentDate: Date | null | undefined,
  rangeStart: Date | string,
  rangeEnd: Date | string,
): Array<{ year: LeaveYear; start: Date; end: Date }> {
  const startKey = toDateOnlyKey(rangeStart);
  const endKey = toDateOnlyKey(rangeEnd);
  if (compareDateOnlyKeys(startKey, endKey) > 0) {
    return [];
  }

  const segments: Array<{ year: LeaveYear; start: Date; end: Date }> = [];
  let cursor = parseDateOnlyKey(startKey);
  const end = parseDateOnlyKey(endKey);

  while (cursor.getTime() <= end.getTime()) {
    const year = leaveYearFor(employmentDate, cursor);
    const segmentEnd =
      year.end.getTime() < end.getTime() ? year.end : end;
    segments.push({
      year,
      start: cursor,
      end: segmentEnd,
    });
    cursor = new Date(segmentEnd.getTime() + DAY_MS);
  }

  return segments;
}

/** Full years of service at `at` (0 before the first anniversary). */
export function fullServiceYears(
  employmentDate: Date | null | undefined,
  at: Date | string,
): number {
  if (!employmentDate) {
    return 0;
  }
  const dayKey = toDateOnlyKey(at);
  const empKey = toDateOnlyKey(employmentDate);
  let years = Number(dayKey.slice(0, 4)) - Number(empKey.slice(0, 4));
  const anniversaryKey = toDateOnlyKey(
    anniversaryInYear(employmentDate, Number(dayKey.slice(0, 4))),
  );
  if (compareDateOnlyKeys(dayKey, anniversaryKey) < 0) {
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
  date: Date | string,
): boolean {
  if (!employmentDate) {
    return false;
  }
  const dayKey = toDateOnlyKey(date);
  const empKey = toDateOnlyKey(employmentDate);
  if (Number(dayKey.slice(0, 4)) <= Number(empKey.slice(0, 4))) {
    return false;
  }
  return (
    dayKey ===
    toDateOnlyKey(anniversaryInYear(employmentDate, Number(dayKey.slice(0, 4))))
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
  const cap =
    maxCarryForwardDays == null ? unused : Math.max(0, maxCarryForwardDays);
  const carriedIn = roundDays(Math.min(unused, cap));
  return { carriedIn, expired: roundDays(unused - carriedIn) };
}

/** Rounds to one decimal (ledger precision). */
export function roundDays(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Human-readable leave-year range for error messages. */
export function formatLeaveYearRange(year: LeaveYear): string {
  return `${toDateOnlyKey(year.start)}–${toDateOnlyKey(year.end)}`;
}
