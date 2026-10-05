/**
 * Shared attendance day weighting for monthly attendance summaries.
 * Half-day schedule days (e.g. Saturday) count as 0.5; full days as 1.
 * Presence is binary (wasPresent) — same rule as AttendanceService.
 */

export interface AttendanceAbsenceLog {
  isHoliday: boolean;
  isWeekend: boolean;
  wasPresent: boolean;
  isHalfDay: boolean;
}

export interface AttendanceDaySummary {
  scheduledDays: number;
  presentDays: number;
  absentDays: number;
}

function roundDays(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Day weight for a scheduled working day.
 */
export function workingDayWeight(isHalfDay: boolean): number {
  return isHalfDay ? 0.5 : 1;
}

/**
 * Monthly attendance summary: scheduled − present = absent, with half-day weights.
 * Holidays and weekends are excluded from scheduled/present/absent.
 */
export function summarizeAttendanceDays(
  logs: ReadonlyArray<AttendanceAbsenceLog>,
): AttendanceDaySummary {
  const workingDayLogs = logs.filter(
    (log) => !log.isHoliday && !log.isWeekend,
  );

  const scheduledDays = workingDayLogs.reduce(
    (sum, log) => sum + workingDayWeight(log.isHalfDay),
    0,
  );
  const presentDays = workingDayLogs
    .filter((log) => log.wasPresent)
    .reduce((sum, log) => sum + workingDayWeight(log.isHalfDay), 0);

  return {
    scheduledDays: roundDays(scheduledDays),
    presentDays: roundDays(presentDays),
    absentDays: roundDays(Math.max(0, scheduledDays - presentDays)),
  };
}
