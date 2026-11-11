/**
 * Legacy message — full-day leave no longer blocks all OT; only duty hours
 * are excluded via {@link buildFullDayLeaveExcludedWindows}.
 */
export const FULL_DAY_LEAVE_MESSAGE =
  'Cannot record overtime during scheduled working hours on an approved leave day.';

export const PAYROLL_LOCKED_MESSAGE =
  'This OT is locked in the current payroll run and cannot be edited';

export const ATTENDANCE_NO_SCANS_MESSAGE =
  'Attendance has no scans for this day.';

/**
 * Weekday lunch (12:30–13:30 EAT) is never OT-eligible on Mon–Fri.
 * Saturday has no lunch block; Sunday/holidays/site days skip this rule.
 */
export const WEEKDAY_LUNCH_OT_MESSAGE =
  'OT cannot be submitted during the lunch break (12:30–13:30 on weekdays)';

export const WEEKDAY_LUNCH_START_MINUTES = 12 * 60 + 30;
export const WEEKDAY_LUNCH_END_MINUTES = 13 * 60 + 30;

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
 * Weekday in Africa/Addis_Ababa (EAT, UTC+3). OT dates are stored as UTC
 * midnight for the EAT civil day, so {@link Date.getUTCDay} matches the
 * local weekday (same offset as Africa/Nairobi).
 */
export function isWeekdayEatDateOnly(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

/**
 * True when the same-day OT interval overlaps weekday lunch 12:30–13:30.
 * Pass `skip: true` for site-assignment days, holidays, or overnight legs.
 */
export function overlapsWeekdayLunchBreak(
  startTime: string,
  endTime: string,
  date: Date,
  options?: { skip?: boolean },
): boolean {
  if (options?.skip) {
    return false;
  }
  if (!isWeekdayEatDateOnly(date)) {
    return false;
  }
  const start = hhmmToMinutes(startTime);
  const end = hhmmToMinutes(endTime);
  return start < WEEKDAY_LUNCH_END_MINUTES && end > WEEKDAY_LUNCH_START_MINUTES;
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
