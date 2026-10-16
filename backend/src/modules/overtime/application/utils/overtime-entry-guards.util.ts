/**
 * Legacy message — full-day leave no longer blocks all OT; only duty hours
 * are excluded via {@link buildFullDayLeaveExcludedWindows}.
 */
export const FULL_DAY_LEAVE_MESSAGE =
  'Cannot record overtime during scheduled working hours on an approved leave day.';

export const PAYROLL_LOCKED_MESSAGE =
  "Overtime entries are locked because this month's payroll run is finalized.";

export const ATTENDANCE_NO_SCANS_MESSAGE =
  'Attendance has no scans for this day.';

export type LeaveHalfDayPortion = 'MORNING' | 'AFTERNOON';

export type LeaveDayPortionInput = 'FULL' | LeaveHalfDayPortion;

export interface WeekdayScheduleSlice {
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
}

export interface AttendanceLogSlice {
  clockInLocal: string | null;
  clockOutLocal: string | null;
  correctedClockInLocal: string | null;
  correctedClockOutLocal: string | null;
}

export interface OvertimeClaimTimes {
  startTime: string;
  endTime: string;
  isOvernight: boolean;
}

/**
 * Builds an excluded schedule window for half-day approved leave.
 */
export function buildLeaveExcludedWindows(
  portion: LeaveHalfDayPortion,
  weekday: WeekdayScheduleSlice | undefined,
): { start: string; end: string } {
  if (portion === 'MORNING') {
    return {
      start: weekday?.morningStart ?? '08:30',
      end: weekday?.morningEnd ?? '12:30',
    };
  }
  return {
    start: weekday?.afternoonStart ?? '13:30',
    end: weekday?.afternoonEnd ?? '17:30',
  };
}

/**
 * Duty hours covered by approved full-day leave (morning start → afternoon end,
 * including lunch). Empty when there is no scheduled duty that day (day off /
 * holiday with no slices) — OT outside duty stays allowed.
 */
export function buildFullDayLeaveExcludedWindows(
  weekday: WeekdayScheduleSlice | undefined,
): Array<{ start: string; end: string }> {
  if (!weekday) {
    return [{ start: '08:30', end: '17:30' }];
  }

  const morningStart = weekday.morningStart;
  const morningEnd = weekday.morningEnd;
  const afternoonStart = weekday.afternoonStart;
  const afternoonEnd = weekday.afternoonEnd;

  if (morningStart && afternoonEnd) {
    return [{ start: morningStart, end: afternoonEnd }];
  }
  if (morningStart && morningEnd) {
    return [{ start: morningStart, end: morningEnd }];
  }
  if (afternoonStart && afternoonEnd) {
    return [{ start: afternoonStart, end: afternoonEnd }];
  }
  // No duty slices (schedule day off) — nothing to exclude; OT may use the whole day.
  return [];
}

/**
 * Maps approved leave portions to duty-hour windows that overtime must not cover.
 * Full-day leave excludes scheduled working hours only (not the whole calendar day).
 */
export function collectLeaveExcludedWindows(
  periods: Array<{ dayPortion: LeaveDayPortionInput }>,
  weekday: WeekdayScheduleSlice | undefined,
): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = [];
  for (const period of periods) {
    if (period.dayPortion === 'FULL') {
      windows.push(...buildFullDayLeaveExcludedWindows(weekday));
      continue;
    }
    if (period.dayPortion === 'MORNING' || period.dayPortion === 'AFTERNOON') {
      windows.push(buildLeaveExcludedWindows(period.dayPortion, weekday));
    }
  }
  return windows;
}

/**
 * Non-blocking attendance mismatch warning for overtime entry preview/save.
 */
export function buildAttendanceWarning(
  log: AttendanceLogSlice | null | undefined,
  claim: OvertimeClaimTimes,
): string | null {
  if (!log) {
    return ATTENDANCE_NO_SCANS_MESSAGE;
  }

  const effectiveIn = log.correctedClockInLocal ?? log.clockInLocal;
  const effectiveOut = log.correctedClockOutLocal ?? log.clockOutLocal;

  if (!effectiveIn && !effectiveOut) {
    return ATTENDANCE_NO_SCANS_MESSAGE;
  }

  if (effectiveOut) {
    const outMinutes = hhmmToMinutes(effectiveOut);
    const claimedEndMinutes = claim.isOvernight
      ? hhmmToMinutes('23:59')
      : hhmmToMinutes(claim.endTime);
    if (outMinutes < claimedEndMinutes) {
      return `Attendance shows clock-out at ${normalizeHhMm(effectiveOut)}.`;
    }
  }

  return null;
}

function normalizeHhMm(value: string): string {
  const parts = value.trim().split(':');
  const h = parts[0]?.padStart(2, '0') ?? '00';
  const m = parts[1]?.padStart(2, '0') ?? '00';
  return `${h}:${m}`;
}

function hhmmToMinutes(value: string): number {
  const normalized = normalizeHhMm(value);
  if (normalized === '24:00') {
    return 24 * 60;
  }
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}
