/**
 * Leave years follow contracts. Each contract opens a leave year on its start
 * date and on every anniversary of that start; a contract's last leave year
 * ends the day before the next contract starts. Dates before the first
 * contract follow the first contract's anniversaries backwards. Employees with
 * no contract fall back to employment anniversaries, else calendar years.
 *
 * A leave year is labelled with the calendar year it starts in
 * (leave_balance.year). Contract leave years are numbered in sequence, so when
 * an early renewal starts a second leave year in the same calendar year, that
 * year takes the next label. Feb 29 anniversaries fall on Feb 28 in other years.
 *
 * All civil dates are interpreted in Africa/Addis_Ababa and compared as
 * YYYY-MM-DD strings - never as timestamps.
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

/** @deprecated Prefer toDateOnlyKey - kept for existing call sites. */
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

/** An employee's contract start dates, which define their leave years. */
export interface LeaveCalendar {
  /** Contract start dates (UTC midnight), ascending and distinct. */
  contractStarts: Date[];
  /** Anchor when there is no contract: employmentDate, else calendar years. */
  fallback: Date | null;
}

/**
 * A leave calendar, or a single anniversary date (null = calendar years) for
 * callers that work from one anchor date.
 */
export type LeaveYearAnchor = LeaveCalendar | Date | null | undefined;

/** Upper bound on leave years walked when resolving one (guards bad data). */
const MAX_CONTRACT_LEAVE_YEARS = 1000;

export function buildLeaveCalendar(
  contractStarts: ReadonlyArray<Date>,
  fallback: Date | null,
): LeaveCalendar {
  const keys = [...new Set(contractStarts.map((start) => toDateOnlyKey(start)))].sort();
  return {
    contractStarts: keys.map(parseDateOnlyKey),
    fallback: fallback ? toDateOnlyUtc(fallback) : null,
  };
}

function isLeaveCalendar(anchor: LeaveYearAnchor): anchor is LeaveCalendar {
  return anchor != null && !(anchor instanceof Date);
}

/** Single anniversary anchor used before the first contract / without contracts. */
function singleAnchor(anchor: LeaveYearAnchor): Date | null {
  if (!isLeaveCalendar(anchor)) {
    return anchor ?? null;
  }
  return anchor.contractStarts[0] ?? anchor.fallback;
}

/** Earliest of employment date and first contract start (null = unknown). */
export function leaveCalendarOrigin(anchor: LeaveYearAnchor): Date | null {
  if (!isLeaveCalendar(anchor)) {
    return anchor ?? null;
  }
  const candidates = [anchor.fallback, anchor.contractStarts[0] ?? null].filter(
    (value): value is Date => value != null,
  );
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? null;
}

/** Anniversary-year leave year for a single anchor date (null = calendar year). */
function anniversaryYearByLabel(anchor: Date | null, label: number): LeaveYear {
  if (!anchor) {
    return { label, start: utcDate(label, 0, 1), end: utcDate(label, 11, 31) };
  }
  const start = anniversaryInYear(anchor, label);
  const next = anniversaryInYear(anchor, label + 1);
  return { label, start, end: new Date(next.getTime() - DAY_MS) };
}

function anniversaryYearFor(anchor: Date | null, date: Date | string): LeaveYear {
  const dayKey = toDateOnlyKey(date);
  const year = Number(dayKey.slice(0, 4));
  if (!anchor) {
    return anniversaryYearByLabel(null, year);
  }
  const thisYearKey = toDateOnlyKey(anniversaryInYear(anchor, year));
  return anniversaryYearByLabel(
    anchor,
    compareDateOnlyKeys(dayKey, thisYearKey) >= 0 ? year : year - 1,
  );
}

/**
 * Leave years from the first contract start onwards, in order. Each contract
 * restarts the cycle on its own start date; the last contract's cycle runs on.
 */
function* contractLeaveYears(starts: ReadonlyArray<Date>): Generator<LeaveYear> {
  let label = Number(toDateOnlyKey(starts[0]!).slice(0, 4)) - 1;
  for (let index = 0; index < starts.length; index += 1) {
    const contractStart = starts[index]!;
    const nextStart = starts[index + 1] ?? null;
    const baseYear = Number(toDateOnlyKey(contractStart).slice(0, 4));
    for (let offset = 0; ; offset += 1) {
      const start = anniversaryInYear(contractStart, baseYear + offset);
      if (nextStart && start.getTime() >= nextStart.getTime()) {
        break;
      }
      const naturalEnd = new Date(
        anniversaryInYear(contractStart, baseYear + offset + 1).getTime() - DAY_MS,
      );
      const end =
        nextStart && naturalEnd.getTime() >= nextStart.getTime()
          ? new Date(nextStart.getTime() - DAY_MS)
          : naturalEnd;
      label = Math.max(baseYear + offset, label + 1);
      yield { label, start, end };
    }
  }
}

function findContractLeaveYear(
  starts: ReadonlyArray<Date>,
  matches: (year: LeaveYear) => boolean,
): LeaveYear {
  let walked = 0;
  for (const year of contractLeaveYears(starts)) {
    if (matches(year)) {
      return year;
    }
    walked += 1;
    if (walked > MAX_CONTRACT_LEAVE_YEARS) {
      break;
    }
  }
  throw new Error('Leave year out of range for the contract calendar');
}

export function leaveYearByLabel(
  anchor: LeaveYearAnchor,
  label: number,
): LeaveYear {
  if (!isLeaveCalendar(anchor) || anchor.contractStarts.length === 0) {
    return anniversaryYearByLabel(singleAnchor(anchor), label);
  }
  const starts = anchor.contractStarts;
  const firstLabel = Number(toDateOnlyKey(starts[0]!).slice(0, 4));
  if (label < firstLabel) {
    return anniversaryYearByLabel(starts[0]!, label);
  }
  return findContractLeaveYear(starts, (year) => year.label >= label);
}

/** Leave year containing `date` (Addis civil date). */
export function leaveYearFor(
  anchor: LeaveYearAnchor,
  date: Date | string,
): LeaveYear {
  if (!isLeaveCalendar(anchor) || anchor.contractStarts.length === 0) {
    return anniversaryYearFor(singleAnchor(anchor), date);
  }
  const starts = anchor.contractStarts;
  const day = toDateOnlyUtc(date).getTime();
  if (day < starts[0]!.getTime()) {
    return anniversaryYearFor(starts[0]!, date);
  }
  return findContractLeaveYear(starts, (year) => year.end.getTime() >= day);
}

/** True when a leave year starts on `date` (contract start or contract anniversary). */
export function isLeaveYearStart(
  anchor: LeaveYearAnchor,
  date: Date | string,
): boolean {
  return (
    toDateOnlyKey(leaveYearFor(anchor, date).start) === toDateOnlyKey(date)
  );
}

/**
 * Split an inclusive date range into segments that each lie in a single leave year.
 */
export function splitRangeByLeaveYears(
  anchor: LeaveYearAnchor,
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
    const year = leaveYearFor(anchor, cursor);
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
