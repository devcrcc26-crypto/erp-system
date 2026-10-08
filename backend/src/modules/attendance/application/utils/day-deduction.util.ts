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
  /**
   * Attendance-exempt employees (no scanner) — treat duty days as full presence.
   * Checked after paid categories (Sunday / holiday / WFH / site / leave).
   */
  isAttendanceExempt?: () => boolean;
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

  if (context.isAttendanceExempt?.()) {
    return { deduction: 0, status: 'PRESENT' };
  }

  // Full absence on any Mon–Sat duty day (Saturday included as 1, never 0.5).
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
  /** Mon–Sat non-holiday days in the employment window; Saturday counts 1. */
  scheduledDays: number;
  /**
   * Scheduled days with a scan (clock-in or clock-out, after corrections), or
   * marked present for attendance-exempt staff. Each counts 1 — never 0.5; a
   * missing punch is a pay deduction, not a half presence.
   */
  presentDays: number;
  absentDays: number;
  paidDays: number;
  leaveDays: number;
  /**
   * True when every Mon–Sat non-holiday day in the employment window has
   * deduction 1 (full absence). Paid days are then forced to 0.
   */
  fullyAbsentWorkingDays: boolean;
  byDate: Map<string, DayDeductionResult>;
}

export const FULLY_ABSENT_NO_PAY_NOTE =
  'Absent all working days — no pay.';

/**
 * Working day for absence pay: Mon–Sat and not a public holiday.
 * Saturday is a full absence day (deduction 1), never 0.5.
 */
export function isAbsenceWorkingDay(
  date: Date,
  context: Pick<DayDeductionContext, 'isSunday' | 'isPublicHoliday'>,
): boolean {
  if (context.isSunday(date)) {
    return false;
  }
  if (context.isPublicHoliday(date)) {
    return false;
  }
  return true;
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
 * Every employed calendar day is included; a missing daily-log row is treated
 * as no scans (same as an empty clock-in/out).
 */
export function employedCalendarDatesForContracts(
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

function uniqueDatesInEmployedWindows(
  month: number,
  year: number,
  contracts: ContractSegment[],
): Date[] {
  return employedCalendarDatesForContracts(month, year, contracts);
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

  const workingDates = dates.filter((date) =>
    isAbsenceWorkingDay(date, input.context),
  );
  const presentDays = workingDates.filter((date) => {
    const key = dateToYyyyMmDd(date);
    const day = input.dailyLogsByDate.get(key);
    const hasScan = Boolean(day?.clockIn || day?.clockOut);
    return hasScan || byDate.get(key)?.status === 'PRESENT';
  }).length;
  const fullyAbsentWorkingDays =
    workingDates.length > 0 &&
    workingDates.every((date) => {
      const result = byDate.get(dateToYyyyMmDd(date));
      return result != null && result.deduction === 1;
    });

  // Normal: paid = employed − absent. Fully absent Mon–Sat month → 0
  // (do not leave Sunday/holiday remainder as paid days).
  const paidDays = fullyAbsentWorkingDays
    ? 0
    : roundDays(Math.max(0, employedDays - absentRounded));

  return {
    employedDays,
    scheduledDays: workingDates.length,
    presentDays,
    absentDays: absentRounded,
    paidDays,
    leaveDays: roundDays(leaveDays),
    fullyAbsentWorkingDays,
    byDate,
  };
}

export interface StoredDayDeduction {
  date: Date;
  dayDeduction: number;
  isHoliday: boolean;
}

/**
 * Fully-absent check on stored daily logs (payroll run), using the same rule
 * as summarizeMonthAbsence: paid days are 0 and every Mon–Sat non-holiday day
 * inside the employed windows has deduction 1. Saturday is a working day here
 * whatever the schedule says; only the calendar Sunday is excluded.
 * With no windows (no contract) every stored log counts.
 */
export function isFullyAbsentFromStoredLogs(
  paidDays: number,
  logs: ReadonlyArray<StoredDayDeduction>,
  windows: ReadonlyArray<{ windowStart: Date; windowEnd: Date }>,
): boolean {
  if (paidDays !== 0) {
    return false;
  }
  const inWindow = (date: Date): boolean =>
    windows.length === 0 ||
    windows.some(
      (window) =>
        date.getTime() >= window.windowStart.getTime() &&
        date.getTime() <= window.windowEnd.getTime(),
    );
  const working = logs.filter(
    (log) => log.date.getUTCDay() !== 0 && !log.isHoliday && inWindow(log.date),
  );
  return (
    working.length > 0 && working.every((log) => log.dayDeduction === 1)
  );
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
