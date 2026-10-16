import { BadRequestException } from '@nestjs/common';
import { END_OF_DAY_HHMM, END_OF_DAY_MINUTES } from './overtime-selectable-windows.util';
import { POLICY_DEFAULTS } from '../../../../shared/policy/policy-definitions';

export const OVERNIGHT_REQUIRED_MESSAGE =
  'End time is before start time. If this entry crosses midnight, mark it as overnight.';

export const SAME_DAY_END_BEFORE_START_MESSAGE =
  'End time must be after start time on the same calendar day.';

export const WITHIN_SCHEDULE_MESSAGE =
  'These hours are within your normal working hours.';

export const OVERNIGHT_NEXT_DAY_CONTEXT_MESSAGE =
  'Overnight entries that cross midnight require the next calendar day schedule context.';

export const OUTSIDE_SELECTABLE_WINDOW_MESSAGE =
  'Overtime times must fall inside the selectable windows for this day (outside scheduled hours and lunch).';

/**
 * Schedule-aware overtime hour splitter (15-minute steps; last block may be shorter).
 *
 * Full working day priority per block:
 * 1. Public holiday → Holiday
 * 2. Non-working day → Weekend
 * 3. Inside morning, afternoon, or excluded windows → skip (not overtime)
 * 4. Night (22:00–06:00) → Night
 * 5. Else → Regular
 *
 * Half working day (e.g. Saturday) priority per block:
 * 1. Holiday
 * 2. Inside morning window → skip
 * 3. At or after morningEnd → Weekend (takes precedence over Night)
 * 4. Before morningStart: Night (22:00–06:00) then Regular (same as weekday)
 *
 * Overnight: each block uses the calendar day it falls on (start-day context, then
 * nextDayContext for minutes on the following day).
 */

export interface OvertimeDayContext {
  isHoliday: boolean;
  isWorkingDay: boolean;
  isHalfDay: boolean;
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
  /** Optional extra excluded windows (e.g. half-day leave), minutes as HH:mm */
  excludedWindows?: Array<{ start: string; end: string }>;
  /** Policy lunchCountsAsOvertime as of the entry date (default: policy default). */
  lunchCountsAsOvertime?: boolean;
}

export interface OvertimeHoursBuckets {
  regularHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
}

const BLOCK_MINUTES = 15;
const MINUTES_PER_DAY = 24 * 60;
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

type OvertimeCategory = keyof OvertimeHoursBuckets;

/**
 * Splits a time interval into overtime buckets using the employee's day context.
 * `date` is unused for classification (context already encodes holiday/weekend)
 * but kept so callers can pair the result with a calendar day.
 * An end time at or before the start time is only accepted when `isOvernight` is set.
 * When the span crosses midnight, `nextDayContext` is required for blocks on the next day.
 */
export function calculateOvertimeHours(
  date: Date,
  startTime: string,
  endTime: string,
  context: OvertimeDayContext,
  isOvernight = false,
  nextDayContext?: OvertimeDayContext,
  options?: { round?: boolean },
): OvertimeHoursBuckets {
  void date;
  const shouldRound = options?.round !== false;
  const startMinutes = parseTimeToMinutes(startTime);
  let endMinutes = parseTimeToMinutes(endTime);

  if (endMinutes <= startMinutes) {
    if (!isOvernight) {
      throw new BadRequestException(SAME_DAY_END_BEFORE_START_MESSAGE);
    }
    endMinutes += MINUTES_PER_DAY;
  }

  const startDayIndex = Math.floor(startMinutes / MINUTES_PER_DAY);
  const buckets: Record<OvertimeCategory, number> = {
    regularHours: 0,
    nightHours: 0,
    weekendHours: 0,
    holidayHours: 0,
  };

  for (let m = startMinutes; m < endMinutes; m += BLOCK_MINUTES) {
    const blockLength = Math.min(BLOCK_MINUTES, endMinutes - m);
    const dayIndex = Math.floor(m / MINUTES_PER_DAY) - startDayIndex;
    const blockContext = resolveBlockContext(
      dayIndex,
      context,
      nextDayContext,
      isOvernight,
    );
    const minutesInDay = ((m % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const category = classifyBlock(minutesInDay, blockContext);
    if (category) {
      buckets[category] += blockLength / 60;
    }
  }

  if (!shouldRound) {
    return { ...buckets };
  }
  return {
    regularHours: roundHours(buckets.regularHours),
    nightHours: roundHours(buckets.nightHours),
    weekendHours: roundHours(buckets.weekendHours),
    holidayHours: roundHours(buckets.holidayHours),
  };
}

/**
 * Sum of all overtime bucket hours.
 */
export function totalOvertimeHours(buckets: OvertimeHoursBuckets): number {
  return roundHours(
    buckets.regularHours +
      buckets.nightHours +
      buckets.weekendHours +
      buckets.holidayHours,
  );
}

/**
 * Positive span length in minutes for a start/end pair (includes overnight extension).
 */
export function overtimeEntrySpanMinutes(
  startTime: string,
  endTime: string,
  isOvernight: boolean,
): number {
  const startMinutes = parseTimeToMinutes(startTime);
  let endMinutes = parseTimeToMinutes(endTime);
  if (endMinutes <= startMinutes) {
    if (!isOvernight) {
      return 0;
    }
    endMinutes += MINUTES_PER_DAY;
  }
  return endMinutes - startMinutes;
}

/**
 * Human-readable note for the overtime entry preview.
 */
export function buildOvertimeScheduleNote(
  date: Date,
  context: OvertimeDayContext,
): string | null {
  const weekday = WEEKDAY_NAMES[date.getUTCDay()] ?? 'Day';
  if (context.isHoliday) {
    return null;
  }
  if (!context.isWorkingDay) {
    return `${weekday} is a non-working day - hours classified as weekend`;
  }
  if (context.isHalfDay) {
    return `${weekday} half day - after morning ends classified as weekend; before morning uses night/regular rules`;
  }
  return null;
}

function resolveBlockContext(
  dayIndex: number,
  context: OvertimeDayContext,
  nextDayContext: OvertimeDayContext | undefined,
  isOvernight: boolean,
): OvertimeDayContext {
  if (dayIndex <= 0) {
    return context;
  }
  if (dayIndex === 1 && nextDayContext) {
    return nextDayContext;
  }
  if (isOvernight && dayIndex >= 1 && !nextDayContext) {
    throw new BadRequestException(OVERNIGHT_NEXT_DAY_CONTEXT_MESSAGE);
  }
  throw new BadRequestException(OVERNIGHT_NEXT_DAY_CONTEXT_MESSAGE);
}

function classifyBlock(
  minutesInDay: number,
  context: OvertimeDayContext,
): OvertimeCategory | null {
  if (context.isHoliday) {
    return 'holidayHours';
  }
  if (!context.isWorkingDay) {
    return 'weekendHours';
  }

  const morningStart = parseHhMmToMinutes(context.morningStart);
  const morningEnd = parseHhMmToMinutes(context.morningEnd);

  if (context.isHalfDay) {
    if (isInsideWindow(minutesInDay, morningStart, morningEnd)) {
      return null;
    }
    // After the half-day morning ends → Weekend (incl. evening/night).
    if (morningEnd != null && minutesInDay >= morningEnd) {
      return 'weekendHours';
    }
    // Before morning: same as a weekday (Night then Regular).
    if (isNightBlock(minutesInDay)) {
      return 'nightHours';
    }
    return 'regularHours';
  }

  if (isInsideScheduledWorkingTime(minutesInDay, context)) {
    return null;
  }

  if (isNightBlock(minutesInDay)) {
    return 'nightHours';
  }

  return 'regularHours';
}

function isInsideScheduledWorkingTime(
  minutesInDay: number,
  context: OvertimeDayContext,
): boolean {
  const morningStart = parseHhMmToMinutes(context.morningStart);
  const morningEnd = parseHhMmToMinutes(context.morningEnd);
  const afternoonStart = parseHhMmToMinutes(context.afternoonStart);
  const afternoonEnd = parseHhMmToMinutes(context.afternoonEnd);

  if (isInsideWindow(minutesInDay, morningStart, morningEnd)) {
    return true;
  }
  if (isInsideWindow(minutesInDay, afternoonStart, afternoonEnd)) {
    return true;
  }
  // Lunch gap between morning and afternoon is not overtime when the policy is off.
  if (
    !(context.lunchCountsAsOvertime ?? POLICY_DEFAULTS.lunchCountsAsOvertime) &&
    morningEnd != null &&
    afternoonStart != null &&
    isInsideWindow(minutesInDay, morningEnd, afternoonStart)
  ) {
    return true;
  }
  if (context.excludedWindows?.length) {
    for (const window of context.excludedWindows) {
      const start = parseHhMmToMinutes(window.start);
      const end = parseHhMmToMinutes(window.end);
      if (isInsideWindow(minutesInDay, start, end)) {
        return true;
      }
    }
  }
  return false;
}

function isNightBlock(minutesInDay: number): boolean {
  const hour = minutesInDay / 60;
  return hour >= 22 || hour < 6;
}

function isInsideWindow(
  minutesInDay: number,
  start: number | null,
  end: number | null,
): boolean {
  if (start == null || end == null) {
    return false;
  }
  return minutesInDay >= start && minutesInDay < end;
}

function parseTimeToMinutes(value: string): number {
  if (value === END_OF_DAY_HHMM || value === '24:00') {
    return END_OF_DAY_MINUTES;
  }
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new BadRequestException(`Invalid time: ${value}`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === 24 && minutes === 0) {
    return END_OF_DAY_MINUTES;
  }
  if (hours > 23 || minutes > 59) {
    throw new BadRequestException(`Invalid time: ${value}`);
  }
  return hours * 60 + minutes;
}

function parseHhMmToMinutes(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}
