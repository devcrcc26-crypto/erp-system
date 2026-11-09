import { BadRequestException } from '@nestjs/common';
import { END_OF_DAY_HHMM, END_OF_DAY_MINUTES } from './overtime-selectable-windows.util';
import { POLICY_DEFAULTS } from '../../../../shared/policy/policy-definitions';

export const OVERNIGHT_REQUIRED_MESSAGE =
  'End time is before start time. If this entry crosses midnight, mark it as overnight.';

export const SAME_DAY_END_BEFORE_START_MESSAGE =
  'End time must be after start time on the same calendar day.';

export const WITHIN_SCHEDULE_MESSAGE =
  'These hours are within your normal working hours.';

/** Shown on preview when the date is inside an approved site assignment. */
export const SITE_ASSIGNMENT_FULL_DAY_OT_MESSAGE =
  'On site assignment — full day OT eligible (regular schedule does not apply).';

export const OVERNIGHT_NEXT_DAY_CONTEXT_MESSAGE =
  'Overnight entries that cross midnight require the next calendar day schedule context.';

export const OUTSIDE_SELECTABLE_WINDOW_MESSAGE =
  'Overtime times must stay outside normal working hours and must not cross your schedule or approved leave. Use separate entries for before-work and after-work overtime.';

export const OVERLAPS_LEAVE_MESSAGE =
  'Overtime times overlap approved leave on this day.';

export const START_INSIDE_SCHEDULE_MESSAGE =
  'Start time falls within normal working hours. Overtime must start outside your schedule.';

export const CROSSES_SCHEDULE_MESSAGE =
  'Overtime entry cannot cross normal working hours. Split into separate entries before and after your schedule.';

export const NO_SELECTABLE_OT_MESSAGE =
  'No overtime times are available for this day (schedule or approved leave).';

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
 *
 * When `scheduledHoursClaimable` is on (site-day policy), scheduled morning/
 * afternoon blocks are not skipped; they fall through to Night/Regular. Lunch
 * (`lunchCountsAsOvertime`) and leave windows stay excluded. Such blocks are
 * also counted in `withinScheduleHours`. Default policy is off for all employees.
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
  /**
   * Date is inside an approved site assignment and the
   * Approved site assignment on this date: scheduled hours are claimable.
   */
  scheduledHoursClaimable?: boolean;
}

export interface OvertimeHoursBuckets {
  regularHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
}

export interface OvertimeHoursDetailed {
  buckets: OvertimeHoursBuckets;
  /** Bucket hours that fell inside scheduled hours on a site day (subset, not extra). */
  withinScheduleHours: number;
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
  return calculateOvertimeHoursDetailed(
    date,
    startTime,
    endTime,
    context,
    isOvernight,
    nextDayContext,
    options,
  ).buckets;
}

/**
 * Same as {@link calculateOvertimeHours}, plus the site-day within-schedule subtotal.
 */
export function calculateOvertimeHoursDetailed(
  date: Date,
  startTime: string,
  endTime: string,
  context: OvertimeDayContext,
  isOvernight = false,
  nextDayContext?: OvertimeDayContext,
  options?: { round?: boolean },
): OvertimeHoursDetailed {
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
  let withinScheduleHours = 0;

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
    const block = classifyBlock(minutesInDay, blockContext);
    if (block) {
      buckets[block.category] += blockLength / 60;
      if (block.withinSchedule) {
        withinScheduleHours += blockLength / 60;
      }
    }
  }

  if (!shouldRound) {
    return { buckets: { ...buckets }, withinScheduleHours };
  }
  return {
    buckets: {
      regularHours: roundHours(buckets.regularHours),
      nightHours: roundHours(buckets.nightHours),
      weekendHours: roundHours(buckets.weekendHours),
      holidayHours: roundHours(buckets.holidayHours),
    },
    withinScheduleHours: roundHours(withinScheduleHours),
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

interface ClassifiedBlock {
  category: OvertimeCategory;
  /** Scheduled time made claimable by a site assignment. */
  withinSchedule: boolean;
}

function classifyBlock(
  minutesInDay: number,
  context: OvertimeDayContext,
): ClassifiedBlock | null {
  if (context.isHoliday) {
    return { category: 'holidayHours', withinSchedule: false };
  }
  if (!context.isWorkingDay) {
    return { category: 'weekendHours', withinSchedule: false };
  }

  const morningStart = parseHhMmToMinutes(context.morningStart);
  const morningEnd = parseHhMmToMinutes(context.morningEnd);
  const claimable = Boolean(context.scheduledHoursClaimable);

  if (context.isHalfDay) {
    if (isInsideWindow(minutesInDay, morningStart, morningEnd)) {
      if (!claimable || isInsideExcludedWindow(minutesInDay, context)) {
        return null;
      }
      // Site day: the half-day morning is normal-band OT, not Weekend.
      return { category: dayBand(minutesInDay), withinSchedule: true };
    }
    // After the half-day morning ends → Weekend (incl. evening/night).
    if (morningEnd != null && minutesInDay >= morningEnd) {
      return { category: 'weekendHours', withinSchedule: false };
    }
    // Before morning: same as a weekday (Night then Regular).
    return { category: dayBand(minutesInDay), withinSchedule: false };
  }

  if (
    isInsideExcludedWindow(minutesInDay, context) ||
    isInsideExcludedLunch(minutesInDay, context)
  ) {
    return null;
  }

  if (isInsideScheduledDutyWindow(minutesInDay, context)) {
    if (!claimable) {
      return null;
    }
    return { category: dayBand(minutesInDay), withinSchedule: true };
  }

  return { category: dayBand(minutesInDay), withinSchedule: false };
}

/** Night (22:00–06:00) or Regular for a working-day block. */
function dayBand(minutesInDay: number): OvertimeCategory {
  return isNightBlock(minutesInDay) ? 'nightHours' : 'regularHours';
}

function isInsideScheduledDutyWindow(
  minutesInDay: number,
  context: OvertimeDayContext,
): boolean {
  const morningStart = parseHhMmToMinutes(context.morningStart);
  const morningEnd = parseHhMmToMinutes(context.morningEnd);
  const afternoonStart = parseHhMmToMinutes(context.afternoonStart);
  const afternoonEnd = parseHhMmToMinutes(context.afternoonEnd);

  return (
    isInsideWindow(minutesInDay, morningStart, morningEnd) ||
    isInsideWindow(minutesInDay, afternoonStart, afternoonEnd)
  );
}

/** Lunch gap between morning and afternoon is not overtime when the policy is off. */
function isInsideExcludedLunch(
  minutesInDay: number,
  context: OvertimeDayContext,
): boolean {
  const morningEnd = parseHhMmToMinutes(context.morningEnd);
  const afternoonStart = parseHhMmToMinutes(context.afternoonStart);
  return (
    !(context.lunchCountsAsOvertime ?? POLICY_DEFAULTS.lunchCountsAsOvertime) &&
    morningEnd != null &&
    afternoonStart != null &&
    isInsideWindow(minutesInDay, morningEnd, afternoonStart)
  );
}

/** Leave (or other) windows that are never overtime, site day or not. */
function isInsideExcludedWindow(
  minutesInDay: number,
  context: OvertimeDayContext,
): boolean {
  for (const window of context.excludedWindows ?? []) {
    const start = parseHhMmToMinutes(window.start);
    const end = parseHhMmToMinutes(window.end);
    if (isInsideWindow(minutesInDay, start, end)) {
      return true;
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
