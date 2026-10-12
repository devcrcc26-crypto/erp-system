import { BadRequestException } from '@nestjs/common';
import { HolidayNationality, Nationality, Prisma } from '@prisma/client';

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type DayBreakdownType = 'working' | 'half' | 'weekend' | 'holiday';

export interface DayBreakdown {
  date: Date;
  type: DayBreakdownType;
  holidayName?: string;
  weight: number;
}

export interface WorkingDaysResult {
  totalDays: Prisma.Decimal;
  breakdown: DayBreakdown[];
}

/**
 * Parses YYYY-MM-DD into a UTC date-only value.
 */
export function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    throw new BadRequestException(`Invalid date: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Formats a Date as YYYY-MM-DD in UTC.
 */
export function formatDateOnly(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * UTC midnight for today's calendar date.
 */
export function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Strips time from a Date, keeping the UTC calendar day.
 */
export function toUtcDateOnly(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

/**
 * Adds calendar days in UTC.
 */
export function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Inclusive calendar-day difference (end - start).
 */
export function differenceInUtcDays(end: Date, start: Date): number {
  const ms =
    toUtcDateOnly(end).getTime() - toUtcDateOnly(start).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Every calendar day from start to end inclusive.
 */
export function iterateUtcDays(startDate: Date, endDate: Date): Date[] {
  const start = toUtcDateOnly(startDate);
  const end = toUtcDateOnly(endDate);
  if (end.getTime() < start.getTime()) {
    throw new BadRequestException('endDate must be on or after startDate');
  }
  const days: Date[] = [];
  let current = start;
  while (current.getTime() <= end.getTime()) {
    days.push(current);
    current = addUtcDays(current, 1);
  }
  return days;
}

function parseHhMmToMinutes(value: string): number {
  const match = HH_MM.exec(value);
  if (!match) {
    throw new BadRequestException(`Invalid time: ${value}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Hours between two HH:mm values, rounded to 1 decimal.
 */
export function hoursBetween(start: string, end: string): number {
  const diff = parseHhMmToMinutes(end) - parseHhMmToMinutes(start);
  if (diff <= 0) {
    throw new BadRequestException('End time must be after start time');
  }
  return Math.round((diff / 60) * 10) / 10;
}

export interface ScheduleDayTimes {
  isWorkingDay: boolean;
  isHalfDay: boolean;
  morningStart?: string | null;
  morningEnd?: string | null;
  afternoonStart?: string | null;
  afternoonEnd?: string | null;
}

/**
 * Validates a single weekday definition and returns auto-calculated hours.
 * `allowSingleShift` (SCAN_ONLY schedules): a full working day may define only
 * the first window (e.g. 07:00–08:30) and leave the afternoon empty.
 */
export function computeAndValidateDayHours(
  day: ScheduleDayTimes,
  options?: { allowSingleShift?: boolean },
): number {
  if (!day.isWorkingDay) {
    return 0;
  }

  if (!day.morningStart || !day.morningEnd) {
    throw new BadRequestException(
      'Working days require morningStart and morningEnd',
    );
  }

  let hours = hoursBetween(day.morningStart, day.morningEnd);

  if (day.isHalfDay) {
    return hours;
  }

  if (
    options?.allowSingleShift &&
    !day.afternoonStart &&
    !day.afternoonEnd
  ) {
    return hours;
  }

  if (!day.afternoonStart || !day.afternoonEnd) {
    throw new BadRequestException(
      'Full working days require afternoonStart and afternoonEnd',
    );
  }

  hours += hoursBetween(day.afternoonStart, day.afternoonEnd);
  return Math.round(hours * 10) / 10;
}

/**
 * Whether a holiday applies to an employee's nationality.
 * Null nationality only observes ALL holidays.
 */
export function holidayAppliesToNationality(
  appliesTo: HolidayNationality,
  nationality: Nationality | null,
): boolean {
  if (appliesTo === HolidayNationality.ALL) {
    return true;
  }
  if (nationality == null) {
    return false;
  }
  return appliesTo === nationality;
}

/**
 * Next occurrence of a holiday on or after `from` (recurring uses month/day).
 */
export function nextHolidayOccurrence(
  holidayDate: Date,
  isRecurring: boolean,
  from: Date,
): Date {
  const stored = toUtcDateOnly(holidayDate);
  if (!isRecurring) {
    return stored;
  }

  const thisYear = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      stored.getUTCMonth(),
      stored.getUTCDate(),
    ),
  );
  if (thisYear.getTime() >= from.getTime()) {
    return thisYear;
  }
  return new Date(
    Date.UTC(
      from.getUTCFullYear() + 1,
      stored.getUTCMonth(),
      stored.getUTCDate(),
    ),
  );
}

/**
 * True when the holiday falls on the given calendar day.
 */
export function holidayFallsOnDate(
  holidayDate: Date,
  isRecurring: boolean,
  day: Date,
): boolean {
  const stored = toUtcDateOnly(holidayDate);
  const target = toUtcDateOnly(day);
  if (isRecurring) {
    return (
      stored.getUTCMonth() === target.getUTCMonth() &&
      stored.getUTCDate() === target.getUTCDate()
    );
  }
  return stored.getTime() === target.getTime();
}

/**
 * True when two inclusive date ranges overlap.
 */
export function dateRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}
