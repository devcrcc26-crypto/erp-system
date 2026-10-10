import type { AttendanceDayStatus, FieldMovementStatus } from '@prisma/client';
import {
  employedCalendarWindow,
  employedPayrollDays,
} from '../../../payroll/application/utils/payroll-days.util';
import { dateToYyyyMmDd } from '../services/attendance-leave.util';
import { EARLY_DEPARTURE_DEDUCTION_MODE } from './attendance-policy.constants';
import {
  evaluateEarlyDeparture,
  type EarlyDepartureBand,
} from './early-departure.util';

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
  /** Approved paid leave (not UNPAID) — counts as present for pay. */
  isOnApprovedLeave: (date: Date) => boolean;
  /**
   * Approved UNPAID leave — full absence (deduction 1), including Saturday.
   * Checked before WFH / site / paid leave so unpaid never produces coverage.
   */
  isOnUnpaidLeave?: (date: Date) => boolean;
  fieldMovementCoverage: (date: Date) => FieldMovementCoverage;
  /**
   * Approved / pending FIELD_VISIT or EARLY_LEAVE only — waives early-departure
   * deduction. FORGOT_CLOCK_* never waives early departure.
   */
  earlyDepartureWaiver?: (date: Date) => FieldMovementCoverage;
  /**
   * Attendance-exempt employees (no scanner) — treat duty days as full presence.
   * Checked after paid categories (Sunday / holiday / WFH / site / leave).
   */
  isAttendanceExempt?: () => boolean;
  /** Override EARLY_DEPARTURE_DEDUCTION_MODE for tests / company settings. */
  earlyDepartureMode?: 'REPORT_ONLY' | 'ENFORCED';
}

export interface DayDeductionResult {
  deduction: DayDeductionValue;
  status: AttendanceDayStatus;
  /** Set when present on a site day (HQ scan) or ON_SITE. */
  siteName?: string | null;
  earlyDepartureBand?: EarlyDepartureBand;
  /** Would-deduct amount for REPORT_ONLY review (never stacked with missing punch). */
  earlyDepartureWouldDeduct?: 0 | 0.5;
}

function roundDays(value: number): number {
  return Math.round(value * 100) / 100;
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
  // Unpaid leave is absence even when a site/WFH row also exists that day.
  if (context.isOnUnpaidLeave?.(date)) {
    return { deduction: 1, status: 'ABSENT' };
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
  const fm = context.fieldMovementCoverage(date);

  // Missing punch: 0.5 unless APPROVED field movement covers the day.
  // Never stack with early-departure on the same day.
  if (missingClockIn || missingClockOut) {
    if (fm === 'APPROVED') {
      return {
        deduction: 0,
        status: 'PRESENT',
        siteName: siteName ?? null,
        earlyDepartureBand: 'COVERED_APPROVED',
        earlyDepartureWouldDeduct: 0,
      };
    }
    if (fm === 'PENDING') {
      return {
        deduction: 0.5,
        status: 'FIELD_MOVEMENT_PENDING',
        earlyDepartureBand: 'PENDING_APPROVAL',
        earlyDepartureWouldDeduct: 0.5,
      };
    }
    return {
      deduction: 0.5,
      status: 'HALF_ABSENT',
      earlyDepartureBand: 'NONE',
      earlyDepartureWouldDeduct: 0,
    };
  }

  // Both punches present — tiered early departure (grace / flag / >1h).
  // Only FIELD_VISIT / EARLY_LEAVE waive; FORGOT_CLOCK_* does not.
  const earlyWaiver = context.earlyDepartureWaiver?.(date) ?? 'NONE';
  const early = evaluateEarlyDeparture({
    clockOut: day.clockOut,
    scheduledEnd: day.scheduledEnd,
    fieldMovement: earlyWaiver,
    mode: context.earlyDepartureMode ?? EARLY_DEPARTURE_DEDUCTION_MODE,
  });

  if (early.band === 'PENDING_APPROVAL') {
    return {
      deduction: early.appliedDeduction,
      status: 'FIELD_MOVEMENT_PENDING',
      siteName: siteName ?? null,
      earlyDepartureBand: early.band,
      earlyDepartureWouldDeduct: early.wouldDeduct,
    };
  }

  if (early.appliedDeduction > 0) {
    return {
      deduction: early.appliedDeduction,
      status: 'HALF_ABSENT',
      siteName: siteName ?? null,
      earlyDepartureBand: early.band,
      earlyDepartureWouldDeduct: early.wouldDeduct,
    };
  }

  return {
    deduction: 0,
    status: 'PRESENT',
    siteName: siteName ?? null,
    earlyDepartureBand: early.band,
    earlyDepartureWouldDeduct: early.wouldDeduct,
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
   * Half-day early-departure deductions never trigger this rule.
   */
  fullyAbsentWorkingDays: boolean;
  /** Days with an early-departure flag (FLAG / OVER_1H / pending / covered). */
  earlyDepartureCount: number;
  /** Applied early-departure deduction days (ENFORCED only). */
  earlyDepartureDeductedDays: number;
  /** Would-deduct early-departure days (REPORT_ONLY or ENFORCED). */
  earlyDepartureWouldDeductDays: number;
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
  let earlyDepartureCount = 0;
  let earlyDepartureDeductedDays = 0;
  let earlyDepartureWouldDeductDays = 0;
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
    const band = result.earlyDepartureBand;
    if (
      band === 'FLAG' ||
      band === 'OVER_1H' ||
      band === 'PENDING_APPROVAL' ||
      band === 'COVERED_APPROVED'
    ) {
      earlyDepartureCount += 1;
    }
    if (band === 'OVER_1H' || band === 'PENDING_APPROVAL') {
      const would = result.earlyDepartureWouldDeduct ?? 0;
      earlyDepartureWouldDeductDays += would;
      if (result.deduction === 0.5 && would === 0.5 && band === 'OVER_1H') {
        earlyDepartureDeductedDays += result.deduction;
      }
      if (band === 'PENDING_APPROVAL' && result.deduction === 0.5) {
        earlyDepartureDeductedDays += result.deduction;
      }
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
  // Early-departure 0.5 days are included in absentRounded when ENFORCED /
  // pending, and never alone force the fully-absent zero-pay rule.
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
    earlyDepartureCount,
    earlyDepartureDeductedDays: roundDays(earlyDepartureDeductedDays),
    earlyDepartureWouldDeductDays: roundDays(earlyDepartureWouldDeductDays),
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

/** Maps field movement approval status to coverage used by dayDeduction. */
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
