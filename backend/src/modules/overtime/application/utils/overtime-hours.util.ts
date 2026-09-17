import { BadRequestException } from '@nestjs/common';

export const OVERNIGHT_REQUIRED_MESSAGE =
  'End time is before start time. If this entry crosses midnight, mark it as overnight.';

/**
 * Schedule-aware overtime hour splitter.
 * Priority per 15-minute block: Holiday > Weekend (non-working day) >
 * half-day overflow > Night (22:00–06:00) > Regular.
 *
 * Night hours stay hardcoded. Weekend and holiday come from WorkScheduleDay
 * / PublicHoliday via OvertimeEntryService — never Sunday/Saturday literals.
 */

export interface OvertimeDayContext {
  isHoliday: boolean;
  isWorkingDay: boolean;
  isHalfDay: boolean;
  morningStart: string | null;
  morningEnd: string | null;
}

export interface OvertimeHoursBuckets {
  regularHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
}

const BLOCK_MINUTES = 15;
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * Splits a time interval into overtime buckets using the employee's day context.
 * `date` is unused for classification (context already encodes holiday/weekend)
 * but kept so callers can pair the result with a calendar day.
 * An end time at or before the start time is only accepted when `isOvernight` is set.
 */
export function calculateOvertimeHours(
  date: Date,
  startTime: string,
  endTime: string,
  context: OvertimeDayContext,
  isOvernight = false,
): OvertimeHoursBuckets {
  void date;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;

  if (endMinutes <= startMinutes) {
    if (!isOvernight) {
      throw new BadRequestException(OVERNIGHT_REQUIRED_MESSAGE);
    }
    endMinutes += 24 * 60;
  }

  let regularHours = 0;
  let nightHours = 0;
  let weekendHours = 0;
  let holidayHours = 0;

  const morningStartMinutes = parseHhMmToMinutes(context.morningStart);
  const morningEndMinutes = parseHhMmToMinutes(context.morningEnd);

  for (let m = startMinutes; m < endMinutes; m += BLOCK_MINUTES) {
    const blockHours = BLOCK_MINUTES / 60;
    const minutesInDay = ((m % (24 * 60)) + 24 * 60) % (24 * 60);
    const hour = minutesInDay / 60;
    const isNightBlock = hour >= 22 || hour < 6;
    const isHalfDayOverflow =
      context.isWorkingDay &&
      context.isHalfDay &&
      isOutsideMorningWindow(
        minutesInDay,
        morningStartMinutes,
        morningEndMinutes,
      );

    if (context.isHoliday) {
      holidayHours += blockHours;
    } else if (!context.isWorkingDay || isHalfDayOverflow) {
      weekendHours += blockHours;
    } else if (isNightBlock) {
      nightHours += blockHours;
    } else {
      regularHours += blockHours;
    }
  }

  return {
    regularHours: roundHours(regularHours),
    nightHours: roundHours(nightHours),
    weekendHours: roundHours(weekendHours),
    holidayHours: roundHours(holidayHours),
  };
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
    return `${weekday} is a non-working day — hours classified as weekend`;
  }
  if (context.isHalfDay) {
    return `${weekday} half day — afternoon classified as weekend`;
  }
  return null;
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

function isOutsideMorningWindow(
  minutesInDay: number,
  morningStart: number | null,
  morningEnd: number | null,
): boolean {
  if (morningStart == null || morningEnd == null) {
    return true;
  }
  return minutesInDay < morningStart || minutesInDay >= morningEnd;
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}
