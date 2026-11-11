/**
 * Schedule-aware leave day weights for balance charging.
 * Payroll uses different rules - do not reuse this for payroll.
 */

import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type DayBreakdown,
  type DayBreakdownType,
  type WorkingDaysResult,
  holidayFallsOnDate,
  iterateUtcDays,
  toUtcDateOnly,
} from '../../../work-schedule/application/services/work-schedule.dates';

export type LeaveDayPortion = 'FULL' | 'MORNING' | 'AFTERNOON';

export interface ScheduleDayLookup {
  isWorkingDay: boolean;
  isHalfDay: boolean;
}

export interface HolidayLookup {
  date: Date;
  isRecurring: boolean;
  name: string;
}

export interface LeavePeriodInput {
  startDate: Date;
  endDate: Date;
  dayPortion?: LeaveDayPortion;
}

export interface LeaveDaysPeriodResult {
  startDate: Date;
  endDate: Date;
  days: number;
  dayPortion: LeaveDayPortion;
  breakdown: DayBreakdown[];
}

export interface LeaveDaysResult {
  startDate: Date;
  endDate: Date;
  days: number;
  periodRows: LeaveDaysPeriodResult[];
  breakdown: DayBreakdown[];
}

const NO_WORKING_DAYS_MESSAGE = 'No working days in this range';

/**
 * Weight of one calendar day for leave balance, given schedule + holidays.
 */
export function weightLeaveCalendarDay(input: {
  date: Date;
  scheduleDay: ScheduleDayLookup | null | undefined;
  holiday: HolidayLookup | null | undefined;
  dayPortion: LeaveDayPortion;
}): DayBreakdown {
  const { date, scheduleDay, holiday, dayPortion } = input;

  if (holiday) {
    return {
      date,
      type: 'holiday',
      holidayName: holiday.name,
      weight: 0,
    };
  }

  if (!scheduleDay || !scheduleDay.isWorkingDay) {
    return { date, type: 'weekend', weight: 0 };
  }

  if (dayPortion === 'MORNING' || dayPortion === 'AFTERNOON') {
    if (scheduleDay.isHalfDay) {
      throw new BadRequestException(
        'Half-day leave (morning/afternoon) is only allowed on a full working weekday',
      );
    }
    return {
      date,
      type: 'half',
      weight: 0.5,
    };
  }

  if (scheduleDay.isHalfDay) {
    return { date, type: 'half', weight: 0.5 };
  }

  return { date, type: 'working', weight: 1 };
}

/**
 * Calculates leave days for one inclusive date range.
 */
export function calculateLeaveDaysForRange(
  startDate: Date,
  endDate: Date,
  resolveScheduleDay: (date: Date) => ScheduleDayLookup | null | undefined,
  holidays: ReadonlyArray<HolidayLookup>,
  dayPortion: LeaveDayPortion = 'FULL',
): WorkingDaysResult {
  const start = toUtcDateOnly(startDate);
  const end = toUtcDateOnly(endDate);
  const calendarDays = iterateUtcDays(start, end);

  if (dayPortion !== 'FULL') {
    if (start.getTime() !== end.getTime()) {
      throw new BadRequestException(
        'Morning/afternoon leave must be a single date',
      );
    }
  }

  const breakdown: DayBreakdown[] = [];
  let total = 0;

  for (const day of calendarDays) {
    const holiday = holidays.find((row) =>
      holidayFallsOnDate(row.date, row.isRecurring, day),
    );
    const row = weightLeaveCalendarDay({
      date: day,
      scheduleDay: resolveScheduleDay(day),
      holiday,
      dayPortion: dayPortion !== 'FULL' ? dayPortion : 'FULL',
    });
    breakdown.push(row);
    total += row.weight;
  }

  return {
    totalDays: new Prisma.Decimal(total.toFixed(1)),
    breakdown,
  };
}

/**
 * Sums leave days across periods (pure: schedule resolver injected).
 */
export function calculateLeaveDaysFromPeriods(
  periods: ReadonlyArray<LeavePeriodInput>,
  resolveScheduleDay: (date: Date) => ScheduleDayLookup | null | undefined,
  holidays: ReadonlyArray<HolidayLookup>,
): LeaveDaysResult {
  if (periods.length === 0) {
    throw new BadRequestException('At least one leave period is required');
  }

  const periodRows: LeaveDaysPeriodResult[] = [];
  const breakdown: DayBreakdown[] = [];
  let totalDays = 0;

  for (const period of periods) {
    const dayPortion = period.dayPortion ?? 'FULL';
    const result = calculateLeaveDaysForRange(
      period.startDate,
      period.endDate,
      resolveScheduleDay,
      holidays,
      dayPortion,
    );
    const days = Number(result.totalDays);
    if (days <= 0) {
      throw new BadRequestException(NO_WORKING_DAYS_MESSAGE);
    }
    periodRows.push({
      startDate: toUtcDateOnly(period.startDate),
      endDate: toUtcDateOnly(period.endDate),
      days,
      dayPortion,
      breakdown: result.breakdown,
    });
    breakdown.push(...result.breakdown);
    totalDays += days;
  }

  periodRows.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  return {
    startDate: periodRows[0].startDate,
    endDate: periodRows[periodRows.length - 1].endDate,
    days: Math.round(totalDays * 10) / 10,
    periodRows,
    breakdown,
  };
}

/**
 * Human-readable charge summary from a day breakdown.
 */
export function summarizeLeaveBreakdown(
  breakdown: ReadonlyArray<DayBreakdown>,
): {
  totalDays: number;
  workingDays: number;
  halfDays: number;
  weekendDays: number;
  holidayDays: number;
} {
  let workingDays = 0;
  let halfDays = 0;
  let weekendDays = 0;
  let holidayDays = 0;
  let totalDays = 0;

  for (const row of breakdown) {
    totalDays += row.weight;
    if (row.type === 'working') {
      workingDays += 1;
    } else if (row.type === 'half') {
      halfDays += 1;
    } else if (row.type === 'weekend') {
      weekendDays += 1;
    } else if (row.type === 'holiday') {
      holidayDays += 1;
    }
  }

  return {
    totalDays: Math.round(totalDays * 10) / 10,
    workingDays,
    halfDays,
    weekendDays,
    holidayDays,
  };
}

export { NO_WORKING_DAYS_MESSAGE };
export type { DayBreakdown, DayBreakdownType };
