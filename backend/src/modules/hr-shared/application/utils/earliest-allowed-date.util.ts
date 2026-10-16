import { dateToYyyyMmDd } from '../../../attendance/application/services/attendance-leave.util';

export type PayrollMonthKey = { month: number; year: number };

export type BackdatingActorKind = 'EMPLOYEE_SELF' | 'HR_ON_BEHALF';

const EARLIEST_OPEN_HISTORY = new Date(Date.UTC(2000, 0, 1));

export function firstDayOfMonthUtc(month: number, year: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

export function monthKey(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthKeyFromDate(date: Date): PayrollMonthKey {
  return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
}

export function formatMonthYearLabel(month: number, year: number): string {
  const d = firstDayOfMonthUtc(month, year);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function isPayrollMonthLockedKey(
  month: number,
  year: number,
  lockedMonths: ReadonlySet<string>,
): boolean {
  return lockedMonths.has(monthKey(month, year));
}

/** 1st day of the calendar month immediately before `today` (UTC). */
export function firstDayOfPreviousMonth(today: Date): Date {
  const monthIndex = today.getUTCMonth();
  const year = today.getUTCFullYear();
  if (monthIndex === 0) {
    return firstDayOfMonthUtc(12, year - 1);
  }
  return firstDayOfMonthUtc(monthIndex, year);
}

/** 1st day of the calendar month containing `today` (UTC). */
export function firstDayOfCurrentMonth(today: Date): Date {
  return firstDayOfMonthUtc(today.getUTCMonth() + 1, today.getUTCFullYear());
}

function compareMonth(a: PayrollMonthKey, b: PayrollMonthKey): number {
  if (a.year !== b.year) {
    return a.year - b.year;
  }
  return a.month - b.month;
}

function addCalendarMonth(key: PayrollMonthKey): PayrollMonthKey {
  if (key.month === 12) {
    return { month: 1, year: key.year + 1 };
  }
  return { month: key.month + 1, year: key.year };
}

function latestLockedMonth(
  lockedMonths: ReadonlySet<string>,
): PayrollMonthKey | null {
  let latest: PayrollMonthKey | null = null;
  for (const key of lockedMonths) {
    const [yearStr, monthStr] = key.split('-');
    const candidate = {
      year: Number(yearStr),
      month: Number(monthStr),
    };
    if (!latest || compareMonth(candidate, latest) > 0) {
      latest = candidate;
    }
  }
  return latest;
}

/**
 * Shared earliest selectable date for HR back-dated requests.
 */
export function getEarliestAllowedDate(params: {
  today: Date;
  lockedMonths: ReadonlySet<string>;
  actorKind: BackdatingActorKind;
}): Date {
  const { today, lockedMonths, actorKind } = params;

  if (actorKind === 'EMPLOYEE_SELF') {
    const previous = firstDayOfPreviousMonth(today);
    const prevKey = monthKeyFromDate(previous);
    if (isPayrollMonthLockedKey(prevKey.month, prevKey.year, lockedMonths)) {
      return firstDayOfCurrentMonth(today);
    }
    return previous;
  }

  const lastLocked = latestLockedMonth(lockedMonths);
  if (!lastLocked) {
    return EARLIEST_OPEN_HISTORY;
  }

  let cursor = addCalendarMonth(lastLocked);
  for (let i = 0; i < 240; i += 1) {
    if (!isPayrollMonthLockedKey(cursor.month, cursor.year, lockedMonths)) {
      return firstDayOfMonthUtc(cursor.month, cursor.year);
    }
    cursor = addCalendarMonth(cursor);
  }
  return firstDayOfCurrentMonth(today);
}

/** True when any calendar day falls before the 1st of the current month (UTC). */
export function isLateSubmissionDate(date: Date, today: Date = new Date()): boolean {
  return date.getTime() < firstDayOfCurrentMonth(today).getTime();
}

export function requiresLateReason(params: {
  actorKind: BackdatingActorKind;
  primaryDate: Date;
  today?: Date;
}): boolean {
  return (
    params.actorKind === 'HR_ON_BEHALF' &&
    isLateSubmissionDate(params.primaryDate, params.today ?? new Date())
  );
}

export function payrollFinalisedMessage(month: number, year: number): string {
  return `Payroll for ${formatMonthYearLabel(month, year)} is finalised - record this as an adjustment in the next payroll.`;
}

export function assertDatesNotBeforeEarliest(
  dates: Date[],
  earliest: Date,
): void {
  const earliestKey = dateToYyyyMmDd(earliest);
  for (const date of dates) {
    if (dateToYyyyMmDd(date) < earliestKey) {
      throw new Error(
        `Date cannot be before ${earliestKey}`,
      );
    }
  }
}

export function assertNoLockedPayrollMonths(
  dates: Date[],
  lockedMonths: ReadonlySet<string>,
): void {
  const seen = new Set<string>();
  for (const date of dates) {
    const key = monthKeyFromDate(date);
    const label = monthKey(key.month, key.year);
    if (seen.has(label)) {
      continue;
    }
    seen.add(label);
    if (isPayrollMonthLockedKey(key.month, key.year, lockedMonths)) {
      throw new Error(payrollFinalisedMessage(key.month, key.year));
    }
  }
}
