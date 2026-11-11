import type { AttendanceDayStatus, FieldMovementStatus } from '@prisma/client';
import {
  employedCalendarWindow,
  employedPayrollDays,
} from '../../../payroll/application/utils/payroll-days.util';
import {
  defaultScheduleDayFlags,
  getDayKind,
  isDutyDayKind,
  type DayKind,
} from '../../../work-schedule/application/utils/get-day-kind.util';
import { dateToYyyyMmDd } from '../services/attendance-leave.util';
import { POLICY_DEFAULTS } from '../../../../shared/policy/policy-definitions';
import {
  evaluateEarlyDeparture,
  type EarlyDepartureBand,
} from './early-departure.util';
import {
  earliestScan,
  isScanAfterDeadline,
  type ScanOnlyRule,
} from './scan-only.util';

export type { DayKind };

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
  /**
   * Schedule + holiday day kind for this employee on the date.
   * When omitted, falls back to Mon–Sat working (Sat half) / Sunday off +
   * {@link isPublicHoliday}.
   */
  dayKind?: (date: Date) => DayKind;
  /**
   * @deprecated Prefer {@link dayKind}. Kept for tests that only stub Sundays;
   * ignored when dayKind is provided.
   */
  isSunday?: (date: Date) => boolean;
  isPublicHoliday: (date: Date) => boolean;
  isWorkFromHome: (date: Date) => boolean;
  /** Approved site assignment covering this date, if any. */
  siteNameForDate: (date: Date) => string | null;
  /** Approved paid leave (not UNPAID) - counts as present for pay. */
  isOnApprovedLeave: (date: Date) => boolean;
  /**
   * Approved UNPAID leave - full absence (deduction 1), including Saturday.
   * Checked before WFH / site / paid leave so unpaid never produces coverage.
   */
  isOnUnpaidLeave?: (date: Date) => boolean;
  fieldMovementCoverage: (date: Date) => FieldMovementCoverage;
  /**
   * Approved / pending FIELD_VISIT or EARLY_LEAVE only - waives early-departure
   * deduction. FORGOT_CLOCK_* never waives early departure.
   */
  earlyDepartureWaiver?: (date: Date) => FieldMovementCoverage;
  /**
   * Attendance-exempt employees (no scanner) - treat duty days as full presence.
   * Checked after paid categories (day off / holiday / WFH / site / leave).
   */
  isAttendanceExempt?: () => boolean;
  /**
   * Hire through day after first scan (no-scan working days). Not absent;
   * shown as ENROLMENT_GRACE on the daily log.
   */
  isEnrolmentGrace?: (date: Date) => boolean;
  /** Policy earlyDepartureMode for the month (default: policy default). */
  earlyDepartureMode?: 'REPORT_ONLY' | 'ENFORCED';
  /** Policy earlyDepartureGraceMinutes for the month. */
  earlyDepartureGraceMinutes?: number;
  /** Policy earlyDepartureDeductMinutes for the month. */
  earlyDepartureDeductMinutes?: number;
  /** Policy unpaidLeaveCountsRestDays for the month. */
  unpaidLeaveCountsRestDays?: boolean;
  /**
   * Inactive period (suspension / long leave) covering the date, with whether
   * it is paid per the inactivePaid policy. Overrides every other rule.
   */
  inactiveForDate?: (date: Date) => { paid: boolean } | null;
  /**
   * SCAN_ONLY work schedule on this date (null / absent = STANDARD). Any scan
   * is full presence; late, early departure and missing punch are skipped.
   */
  scanOnlyRule?: (date: Date) => ScanOnlyRule | null;
}

/**
 * Resolves day kind from context (schedule-aware dayKind, else holiday +
 * legacy Sunday / default Mon–Sat).
 */
export function resolveContextDayKind(
  date: Date,
  context: Pick<DayDeductionContext, 'dayKind' | 'isSunday' | 'isPublicHoliday'>,
): DayKind {
  if (context.dayKind) {
    return context.dayKind(date);
  }
  if (context.isPublicHoliday(date)) {
    return 'HOLIDAY';
  }
  if (context.isSunday?.(date) ?? date.getUTCDay() === 0) {
    return 'DAY_OFF';
  }
  const flags = defaultScheduleDayFlags(date.getUTCDay());
  return getDayKind({
    isHoliday: false,
    isWorkingDay: flags.isWorkingDay,
    isHalfDay: flags.isHalfDay,
  });
}

/**
 * Includes DAY_OFF / WORKED_ON_DAY_OFF before Prisma client regen after migrate.
 * Cast to AttendanceDayStatus when persisting once the enum is generated.
 */
export type DayDeductionStatus =
  | AttendanceDayStatus
  | 'DAY_OFF'
  | 'WORKED_ON_DAY_OFF'
  | 'UNPAID_LEAVE';

export interface DayDeductionResult {
  deduction: DayDeductionValue;
  status: DayDeductionStatus;
  /** Set when present on a site day (HQ scan) or ON_SITE. */
  siteName?: string | null;
  earlyDepartureBand?: EarlyDepartureBand;
  /** Would-deduct amount for REPORT_ONLY review (never stacked with missing punch). */
  earlyDepartureWouldDeduct?: 0 | 0.5;
  /** True when the day was evaluated under a SCAN_ONLY schedule. */
  scanOnly?: boolean;
  /**
   * SCAN_ONLY: earliest scan (HH:mm) when it is after latestScanTime - flagged
   * SCAN_AFTER_DEADLINE for HR review. No pay effect.
   */
  scanAfterDeadlineTime?: string | null;
  /**
   * Approved paid leave with any HQ scan - leave status stays; HR review flag
   * ON_LEAVE_BUT_SCANNED. No automatic change to the leave request.
   */
  onLeaveButScanned?: boolean;
}

function roundDays(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Single source of truth for attendance absence weight and payroll paid days.
 *
 * Precedence (when the unpaidLeaveCountsRestDays policy is on): unpaid leave →
 * holiday / day off → paid leave → site / WFH → exempt → scan rules.
 * When it is off, unpaid leave is evaluated only on duty days
 * (after holiday / day off).
 */
export function dayDeduction(
  date: Date,
  day: DayDeductionDayInput,
  context: DayDeductionContext,
): DayDeductionResult {
  const kind = resolveContextDayKind(date, context);
  const hasClockIn = Boolean(day.clockIn);
  const hasClockOut = Boolean(day.clockOut);
  const hasAnyScan = hasClockIn || hasClockOut;

  // Inactive (suspended / long leave): not absent; unpaid days deduct like unpaid leave.
  const inactive = context.inactiveForDate?.(date) ?? null;
  if (inactive) {
    return { deduction: inactive.paid ? 0 : 1, status: 'INACTIVE' };
  }

  // Unpaid leave: deduction 1, status UNPAID_LEAVE. Optionally includes rest days.
  if (context.isOnUnpaidLeave?.(date)) {
    if (
      (context.unpaidLeaveCountsRestDays ?? POLICY_DEFAULTS.unpaidLeaveCountsRestDays) ||
      (kind !== 'HOLIDAY' && kind !== 'DAY_OFF')
    ) {
      return { deduction: 1, status: 'UNPAID_LEAVE' };
    }
  }

  if (kind === 'HOLIDAY') {
    return { deduction: 0, status: 'HOLIDAY' };
  }

  if (kind === 'DAY_OFF') {
    // Scans on a day off are informational only - no pay change, no flags.
    if (hasAnyScan) {
      return { deduction: 0, status: 'WORKED_ON_DAY_OFF' };
    }
    return { deduction: 0, status: 'DAY_OFF' };
  }

  // Paid leave before site/WFH. Scans do not change leave pay; flag for HR.
  if (context.isOnApprovedLeave(date)) {
    return {
      deduction: 0,
      status: 'LEAVE',
      onLeaveButScanned: hasAnyScan,
    };
  }

  // Approved site / WFH: full coverage regardless of scans (no missing-punch /
  // late / early flags). Scans are retained on the daily log for display.
  if (context.isWorkFromHome(date)) {
    return { deduction: 0, status: 'WORK_FROM_HOME' };
  }

  const siteName = context.siteNameForDate(date);
  if (siteName) {
    return { deduction: 0, status: 'ON_SITE', siteName };
  }

  if (context.isAttendanceExempt?.()) {
    return { deduction: 0, status: 'PRESENT' };
  }

  const scanOnly = context.scanOnlyRule?.(date) ?? null;
  if (scanOnly) {
    return scanOnlyDayDeduction(date, day, scanOnly, null, context);
  }

  // Full absence on any WORKING / HALF_DAY duty day (Saturday = 1, same as weekday).
  if (!hasClockIn && !hasClockOut) {
    if (context.isEnrolmentGrace?.(date)) {
      return { deduction: 0, status: 'ENROLMENT_GRACE' };
    }
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

  // Both punches present - tiered early departure (grace / flag / >1h).
  // Only FIELD_VISIT / EARLY_LEAVE waive; FORGOT_CLOCK_* does not.
  const earlyWaiver = context.earlyDepartureWaiver?.(date) ?? 'NONE';
  const early = evaluateEarlyDeparture({
    clockOut: day.clockOut,
    scheduledEnd: day.scheduledEnd,
    fieldMovement: earlyWaiver,
    mode: context.earlyDepartureMode ?? POLICY_DEFAULTS.earlyDepartureMode,
    graceMinutes: context.earlyDepartureGraceMinutes,
    deductMinutes: context.earlyDepartureDeductMinutes,
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

/**
 * SCAN_ONLY duty day (after day off / holiday / unpaid / leave / WFH / site /
 * exempt): any scan → PRESENT 0; no scan → enrolment grace or ABSENT 1.
 * Earliest scan after latestScanTime is flagged only - status and pay unchanged.
 */
function scanOnlyDayDeduction(
  date: Date,
  day: DayDeductionDayInput,
  rule: ScanOnlyRule,
  siteName: string | null,
  context: DayDeductionContext,
): DayDeductionResult {
  const scan = earliestScan(day.clockIn, day.clockOut);
  if (!scan) {
    if (context.isEnrolmentGrace?.(date)) {
      return { deduction: 0, status: 'ENROLMENT_GRACE', scanOnly: true };
    }
    return { deduction: 1, status: 'ABSENT', scanOnly: true };
  }
  return {
    deduction: 0,
    status: 'PRESENT',
    siteName: siteName ?? null,
    scanOnly: true,
    scanAfterDeadlineTime: isScanAfterDeadline(scan, rule.latestScanTime)
      ? scan
      : null,
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
  /** WORKING / HALF_DAY days in the employment window (each counts 1). */
  scheduledDays: number;
  /**
   * Days attended (duty days with a scan, or marked present for exempt staff).
   * Day offs / Sundays / holidays / unpaid leave are never included.
   */
  presentDays: number;
  /**
   * Non-unpaid absence deductions (no-scan, missing punch, early departure, …).
   * Unpaid leave is tracked separately in {@link unpaidLeaveDays}.
   */
  absentDays: number;
  /**
   * Approved unpaid leave deductions this month (separate from absentDays).
   * Includes unpaid inactive-period days (deducted like unpaid leave).
   */
  unpaidLeaveDays: number;
  /** Days inside an inactive period (paid or unpaid). */
  inactiveDays: number;
  /** Unpaid inactive-period days (already included in unpaidLeaveDays). */
  inactiveUnpaidDays: number;
  /**
   * Paid days on the 30-day basis: employedDays − absentDays − unpaidLeaveDays
   * (or 0 when fully absent on every duty day).
   */
  paidDays: number;
  leaveDays: number;
  /**
   * True when no Mon–Sat duty day was worked/covered (full absence or unpaid).
   * Paid days are forced to 0 so Sundays are not left as paid rest.
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
  'Absent all working days - no pay.';

/**
 * Duty day for absence pay / fully-absent / COVERED: WORKING or HALF_DAY.
 * HALF_DAY (CRCC Saturday) still counts as a full absence day (deduction 1).
 */
export function isAbsenceWorkingDay(
  date: Date,
  context: Pick<DayDeductionContext, 'dayKind' | 'isSunday' | 'isPublicHoliday'>,
): boolean {
  return isDutyDayKind(resolveContextDayKind(date, context));
}

/** Sundays in the employed calendar window (paid rest when any duty day was worked). */
export function countSundaysInDates(dates: ReadonlyArray<Date>): number {
  return dates.filter((date) => date.getUTCDay() === 0).length;
}

/**
 * True when the employee worked or had paid coverage on at least one Mon–Sat
 * duty day (not a full ABSENT / UNPAID_LEAVE / unpaid INACTIVE miss).
 */
export function workedAnyDutyDay(
  workingDates: ReadonlyArray<Date>,
  byDate: ReadonlyMap<string, DayDeductionResult>,
): boolean {
  return workingDates.some((date) => {
    const result = byDate.get(dateToYyyyMmDd(date));
    if (!result) {
      return false;
    }
    if (
      result.status === 'UNPAID_LEAVE' ||
      result.status === 'INACTIVE'
    ) {
      return false;
    }
    // Full unauthorized absence — does not count as worked.
    if (result.status === 'ABSENT' && result.deduction >= 1) {
      return false;
    }
    return true;
  });
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
  let unpaidLeaveDays = 0;
  let inactiveDays = 0;
  let inactiveUnpaidDays = 0;
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
    if (result.status === 'INACTIVE') {
      inactiveDays += 1;
      inactiveUnpaidDays += result.deduction;
      unpaidLeaveDays += result.deduction;
    } else if (result.status === 'UNPAID_LEAVE') {
      unpaidLeaveDays += result.deduction;
    } else {
      absentDays += result.deduction;
    }
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
  const unpaidRounded = roundDays(unpaidLeaveDays);

  const workingDates = dates.filter((date) =>
    isAbsenceWorkingDay(date, input.context),
  );
  const presentDays = workingDates.filter((date) => {
    const key = dateToYyyyMmDd(date);
    const day = input.dailyLogsByDate.get(key);
    const status = byDate.get(key)?.status;
    if (status === 'UNPAID_LEAVE' || status === 'INACTIVE') {
      return false;
    }
    const hasScan = Boolean(day?.clockIn || day?.clockOut);
    return hasScan || status === 'PRESENT';
  }).length;
  // Sundays are paid rest only when at least one Mon–Sat duty day was worked.
  // Full-month absence / unpaid leave → exclude Sundays (paidDays = 0).
  // Use duty-day presence (not employed−absent−Sundays): the 30-day employed
  // base can disagree with calendar Sunday counts on short months.
  const anyDutyDayWorked = workedAnyDutyDay(workingDates, byDate);
  const fullyAbsentWorkingDays =
    workingDates.length > 0 && !anyDutyDayWorked;

  const paidDays = !anyDutyDayWorked
    ? 0
    : roundDays(
        Math.max(0, employedDays - absentRounded - unpaidRounded),
      );

  return {
    employedDays,
    scheduledDays: workingDates.length,
    presentDays,
    absentDays: absentRounded,
    unpaidLeaveDays: unpaidRounded,
    inactiveDays,
    inactiveUnpaidDays: roundDays(inactiveUnpaidDays),
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
  /**
   * Schedule day off (isWeekend on the daily log). When omitted, falls back to
   * calendar Sunday only (legacy).
   */
  isWeekend?: boolean;
  /** CRCC Saturday (half-day schedule). Full miss still deducts 1. */
  isHalfDay?: boolean;
}

/**
 * Fully-absent check on stored daily logs (payroll run): paid days are 0 and
 * every Mon–Sat duty day is a full miss (deduction ≥ 1). Sundays excluded.
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
  const working = logs.filter((log) => {
    if (!inWindow(log.date) || log.isHoliday) {
      return false;
    }
    const isOff =
      log.isWeekend ?? log.date.getUTCDay() === 0;
    return !isOff;
  });
  return (
    working.length > 0 &&
    working.every((log) => log.dayDeduction >= 1)
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
