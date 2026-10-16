/**
 * Date-only helpers for HR request validation.
 *
 * "Today" is the company's calendar day (Africa/Addis_Ababa, UTC+3), not the server's
 * or UTC's. Date-only values are represented as `YYYY-MM-DD` strings for comparison and
 * as UTC-midnight `Date`s for storage - Prisma `@db.Date` columns persist the UTC calendar
 * date, so this keeps stored days identical to what the user picked regardless of the
 * server's timezone.
 */

export const COMPANY_TIMEZONE = 'Africa/Addis_Ababa';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const MS_PER_DAY = 86_400_000;

/** Calendar date (`YYYY-MM-DD`) of `date` in the given timezone. */
export function toDateOnlyInTimezone(
  date: Date,
  tz: string = COMPANY_TIMEZONE,
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Today's calendar date (`YYYY-MM-DD`) in the given timezone. */
export function getTodayInTimezone(tz: string = COMPANY_TIMEZONE): string {
  return toDateOnlyInTimezone(new Date(), tz);
}

/**
 * Parses the date portion of `YYYY-MM-DD` (or an ISO string starting with it) into a
 * UTC-midnight Date for that calendar day. Throws on malformed input.
 */
export function parseLocalDateOnly(value: string): Date {
  const match = DATE_ONLY_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid date: ${value}`);
  }
  const [, y, m, d] = match;
  const parsed = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    parsed.getUTCFullYear() !== Number(y) ||
    parsed.getUTCMonth() !== Number(m) - 1 ||
    parsed.getUTCDate() !== Number(d)
  ) {
    throw new Error(`Invalid date: ${value}`);
  }
  return parsed;
}

/** `YYYY-MM-DD` of a date-only value (string or UTC-midnight Date). */
export function dateOnlyString(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return parseLocalDateOnly(value).toISOString().slice(0, 10);
}

/** Today (company timezone) as a UTC-midnight Date, comparable with parsed date-only values. */
export function startOfToday(): Date {
  return parseLocalDateOnly(getTodayInTimezone());
}

/** True when the date-only value is after today (company timezone). */
export function isDateInFuture(value: string | Date): boolean {
  return dateOnlyString(value) > getTodayInTimezone();
}

/** True when the date-only value is before today (company timezone). */
export function isDateInPast(value: string | Date): boolean {
  return dateOnlyString(value) < getTodayInTimezone();
}

/** True when an instant falls on a calendar day before today (company timezone). */
export function isInstantOnPastDay(instant: Date): boolean {
  return toDateOnlyInTimezone(instant) < getTodayInTimezone();
}

/** Inclusive calendar-day count between two date-only values (end >= start). */
export function calendarDaysInclusive(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}
