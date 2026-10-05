import type { AttendanceDayStatus, FieldMovementStatus } from '@prisma/client';
import {
  employedCalendarWindow,
  employedPayrollDays,
} from '../../../payroll/application/utils/payroll-days.util';
import { dateToYyyyMmDd } from '../services/attendance-leave.util';

export type DayDeductionValue = 0 | 0.5 | 1;

export type FieldMovementCoverage = 'NONE' | 'APPROVED' | 'PENDING';

export interface DayDeductionDayInput {
  date: Date;
  clockIn: string | null;
  clockOut: string | null;
  isLastExportDay: boolean;
  scheduledEnd: string | null;
}

export interface DayDeductionContext {
  isSunday: (date: Date) => boolean;
  isPublicHoliday: (date: Date) => boolean;
  isWorkFromHome: (date: Date) => boolean;
  /** Approved site assignment covering this date, if any. */
  siteNameForDate: (date: Date) => string | null;
  isOnApprovedLeave: (date: Date) => boolean;
  fieldMovementCoverage: (date: Date) => FieldMovementCoverage;
}

export interface DayDeductionResult {
  deduction: DayDeductionValue;
  status: AttendanceDayStatus;
  /** Set when present on a site day (HQ scan) or ON_SITE. */
  siteName?: string | null;
}

function roundDays(value: number): number {
  return Math.round(value * 100) / 100;
}

function isBeforeTime(actual: string, scheduled: string): boolean {
  const [aH, aM] = actual.split(':').map(Number);
  const [sH, sM] = scheduled.split(':').map(Number);
  return (aH ?? 0) * 60 + (aM ?? 0) < (sH ?? 0) * 60 + (sM ?? 0);
}

/**
 * Single source of truth for attendance absence weight and payroll paid days.
 */
export function dayDeduction(
  date: Date,
  day: DayDeductionDayInput,
  context: DayDeductionContext,
): DayDeductionResult {
  if (context.isSunday(date)) {
    return { deduction: 0, status: 'SUNDAY' };
  }
  if (context.isPublicHoliday(date)) {
    return { deduction: 0, status: 'HOLIDAY' };
  }
  if (context.isWorkFromHome(date)) {
    return { deduction: 0, status: 'WORK_FROM_HOME' };
  }

  const siteName = context.siteNameForDate(date);
  const hasClockIn = Boolean(day.clockIn);
  const hasClockOut = Boolean(day.clockOut);

  if (siteName && !hasClockIn && !hasClockOut) {
    return { deduction: 0, status: 'ON_SITE', siteName };
  }

  if (context.isOnApprovedLeave(date)) {
    return { deduction: 0, status: 'LEAVE' };
  }

  if (!hasClockIn && !hasClockOut) {
    return { deduction: 1, status: 'ABSENT' };
  }

  const missingClockIn = !hasClockIn && hasClockOut;
  const missingClockOut =
    hasClockIn && !hasClockOut && !day.isLastExportDay;
  const earlyDeparture =
    hasClockIn &&
    hasClockOut &&
    day.scheduledEnd != null &&
    day.clockOut != null &&
    isBeforeTime(day.clockOut, day.scheduledEnd);

  if (missingClockIn || missingClockOut || earlyDeparture) {
    const fm = context.fieldMovementCoverage(date);
    if (fm === 'APPROVED') {
      return { deduction: 0, status: 'PRESENT', siteName: siteName ?? null };
    }
    if (fm === 'PENDING') {
      return { deduction: 0.5, status: 'FIELD_MOVEMENT_PENDING' };
    }
    return { deduction: 0.5, status: 'HALF_ABSENT' };
  }

  return {
    deduction: 0,
    status: 'PRESENT',
    siteName: siteName ?? null,
  };
}

export interface ContractSegment {
  startDate: Date;
  endDate: Date | null;
}

export interface MonthAbsenceSummaryInput {
  month: number;
  year: number;
  contracts: ContractSegment[];
  dailyLogsByDate: Map<string, DayDeductionDayInput>;
  context: DayDeductionContext;
}

export interface MonthAbsenceSummary {
  employedDays: number;
  absentDays: number;
  paidDays: number;
  leaveDays: number;
  byDate: Map<string, DayDeductionResult>;
}

function eachDateInWindow(
  month: number,
  year: number,
  contractStart: Date,
  contractEnd: Date | null,
): Date[] {
  const window = employedCalendarWindow(
    month,
    year,
    contractStart,
    contractEnd,
  );
  if (!window) {
    return [];
  }
  const dates: Date[] = [];
  const cursor = new Date(window.windowStart.getTime());
  const end = window.windowEnd.getTime();
  while (cursor.getTime() <= end) {
    dates.push(new Date(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Sums dayDeduction across the payroll employment window for a month.
 */
function uniqueDatesInEmployedWindows(
  month: number,
  year: number,
  contracts: ContractSegment[],
): Date[] {
  const keys = new Set<string>();
  const dates: Date[] = [];
  for (const contract of contracts) {
    for (const date of eachDateInWindow(
      month,
      year,
      contract.startDate,
      contract.endDate,
    )) {
      const key = dateToYyyyMmDd(date);
      if (!keys.has(key)) {
        keys.add(key);
        dates.push(date);
      }
    }
  }
  dates.sort((a, b) => a.getTime() - b.getTime());
  return dates;
}

function totalEmployedDays(
  month: number,
  year: number,
  contracts: ContractSegment[],
): number {
  let total = 0;
  for (const contract of contracts) {
    total += employedPayrollDays(
      month,
      year,
      contract.startDate,
      contract.endDate,
    ).days;
  }
  return total;
}

export function summarizeMonthAbsence(
  input: MonthAbsenceSummaryInput,
): MonthAbsenceSummary {
  const employedDays = totalEmployedDays(
    input.month,
    input.year,
    input.contracts,
  );
  const dates = uniqueDatesInEmployedWindows(
    input.month,
    input.year,
    input.contracts,
  );

  let absentDays = 0;
  let leaveDays = 0;
  const byDate = new Map<string, DayDeductionResult>();

  for (const date of dates) {
    const key = dateToYyyyMmDd(date);
    const dayInput = input.dailyLogsByDate.get(key) ?? {
      date,
      clockIn: null,
      clockOut: null,
      isLastExportDay: false,
      scheduledEnd: null,
    };
    const result = dayDeduction(date, dayInput, input.context);
    byDate.set(key, result);
    absentDays += result.deduction;
    if (result.status === 'LEAVE') {
      leaveDays += 1;
    }
  }

  const absentRounded = roundDays(absentDays);
  const paidDays = roundDays(Math.max(0, employedDays - absentRounded));

  return {
    employedDays,
    absentDays: absentRounded,
    paidDays,
    leaveDays: roundDays(leaveDays),
    byDate,
  };
}

/** Maps field movement log status to coverage used by dayDeduction. */
export function fieldMovementCoverageFromStatus(
  status: FieldMovementStatus | null | undefined,
): FieldMovementCoverage {
  if (status === 'APPROVED') {
    return 'APPROVED';
  }
  if (
    status === 'SUBMITTED' ||
    status === 'IN_REVIEW' ||
    status === 'RETURNED'
  ) {
    return 'PENDING';
  }
  return 'NONE';
}
