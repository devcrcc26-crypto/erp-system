import { BadRequestException } from '@nestjs/common';
import type { DayCover } from '../../../hr-shared/application/utils/day-coverage.util';
import { addUtcDays, formatDateOnly } from './work-schedule.dates';

/** Longest work-from-home range one request may cover (calendar days). */
export const WFH_MAX_RANGE_DAYS = 31;

export type WorkFromHomeSkipReason =
  | 'SUNDAY'
  | 'HOLIDAY'
  | 'NON_WORKING_DAY'
  | 'LEAVE'
  | 'SITE_ASSIGNMENT'
  | 'ALREADY_WFH'
  | 'WFH_REQUESTED'
  | 'FIELD_MOVEMENT'
  | 'ATTENDANCE';

export interface WorkFromHomeRangeDay {
  date: string;
  included: boolean;
  reason?: WorkFromHomeSkipReason;
  holidayName?: string;
  /** Request number of the leave / site assignment / request that covers it. */
  reference?: string | null;
}

export interface WorkFromHomeRangePlan {
  startDate: string;
  endDate: string;
  days: WorkFromHomeRangeDay[];
  /** Dates (YYYY-MM-DD) that become work-from-home days on approval. */
  dates: string[];
  skipped: Array<{ date: string; reason: WorkFromHomeSkipReason }>;
  workingDays: number;
}

/** Schedule view of one calendar day (from WorkScheduleService breakdown). */
export interface ScheduleDayType {
  date: Date;
  type: 'working' | 'half' | 'weekend' | 'holiday';
  holidayName?: string;
}

/**
 * Validates start ≤ end and the range length (inclusive calendar days).
 */
export function assertWorkFromHomeRange(
  start: Date,
  end: Date,
  maxDays: number = WFH_MAX_RANGE_DAYS,
): void {
  if (end.getTime() < start.getTime()) {
    throw new BadRequestException('End date must be on or after start date');
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > maxDays) {
    throw new BadRequestException(
      `A work-from-home request can cover at most ${maxDays} days`,
    );
  }
}

function coverReason(cover: DayCover): WorkFromHomeSkipReason {
  switch (cover.module) {
    case 'LEAVE':
      return 'LEAVE';
    case 'SITE_ASSIGNMENT':
      return 'SITE_ASSIGNMENT';
    case 'WORK_FROM_HOME':
      return cover.state === 'APPROVED' ? 'ALREADY_WFH' : 'WFH_REQUESTED';
    case 'FIELD_MOVEMENT':
      return 'FIELD_MOVEMENT';
    default:
      return 'ATTENDANCE';
  }
}

/**
 * Splits a range into the working days that will be created (per the
 * employee's schedule) and skipped days with a reason. Precedence:
 * holiday → schedule day off → leave / site / already WFH /
 * pending WFH / field movement.
 * Attendance is not used at request time (imported after month-end).
 */
export function planWorkFromHomeRange(input: {
  start: Date;
  end: Date;
  schedule: ReadonlyArray<ScheduleDayType>;
  covers: ReadonlyArray<DayCover>;
}): WorkFromHomeRangePlan {
  assertWorkFromHomeRange(input.start, input.end);
  const scheduleByKey = new Map(
    input.schedule.map((row) => [formatDateOnly(row.date), row]),
  );
  const coversByKey = new Map<string, DayCover>();
  for (const cover of input.covers) {
    const existing = coversByKey.get(cover.date);
    if (!existing || (existing.state !== 'APPROVED' && cover.state === 'APPROVED')) {
      coversByKey.set(cover.date, cover);
    }
  }

  const days: WorkFromHomeRangeDay[] = [];
  for (
    let cursor = input.start;
    cursor.getTime() <= input.end.getTime();
    cursor = addUtcDays(cursor, 1)
  ) {
    const key = formatDateOnly(cursor);
    const scheduleDay = scheduleByKey.get(key);
    if (scheduleDay?.type === 'holiday') {
      days.push({
        date: key,
        included: false,
        reason: 'HOLIDAY',
        holidayName: scheduleDay.holidayName,
      });
      continue;
    }
    if (!scheduleDay || scheduleDay.type === 'weekend') {
      days.push({ date: key, included: false, reason: 'NON_WORKING_DAY' });
      continue;
    }
    const cover = coversByKey.get(key);
    if (cover) {
      days.push({
        date: key,
        included: false,
        reason: coverReason(cover),
        reference: cover.reference ?? null,
      });
      continue;
    }
    days.push({ date: key, included: true });
  }

  const dates = days.filter((day) => day.included).map((day) => day.date);
  return {
    startDate: formatDateOnly(input.start),
    endDate: formatDateOnly(input.end),
    days,
    dates,
    skipped: days
      .filter((day) => !day.included)
      .map((day) => ({ date: day.date, reason: day.reason! })),
    workingDays: dates.length,
  };
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** "Aug 11 – Aug 15 (4 days)" - single day: "Aug 11 (1 day)". */
export function formatWorkFromHomeRangeLabel(
  startDate: string,
  endDate: string,
  workingDays: number,
): string {
  const label = (key: string): string => {
    const [, month, day] = key.split('-').map(Number);
    return `${MONTHS[(month ?? 1) - 1]} ${day}`;
  };
  const count = `${workingDays} day${workingDays === 1 ? '' : 's'}`;
  return startDate === endDate
    ? `${label(startDate)} (${count})`
    : `${label(startDate)} – ${label(endDate)} (${count})`;
}

/** Dates a WFH approval form covers: `dates` (range) or legacy single `date`. */
export function workFromHomeFormDates(formData: unknown): string[] {
  if (!formData || typeof formData !== 'object') {
    return [];
  }
  const data = formData as { dates?: unknown; date?: unknown };
  if (Array.isArray(data.dates)) {
    return data.dates.filter((value): value is string => typeof value === 'string');
  }
  return typeof data.date === 'string' ? [data.date] : [];
}

/** Distinct calendar months touched by a list of YYYY-MM-DD dates. */
export function monthsOfDateKeys(
  keys: ReadonlyArray<string>,
): Array<{ month: number; year: number }> {
  const seen = new Map<string, { month: number; year: number }>();
  for (const key of keys) {
    const [year, month] = key.split('-').map(Number);
    if (year && month) {
      seen.set(`${year}-${month}`, { month, year });
    }
  }
  return [...seen.values()];
}
