/**
 * Import-time attendance day counts, before the month is recomputed with
 * summarizeMonthAbsence (which then sets scheduled / present / absent / paid).
 * This helper still counts each duty day as 1 for scheduled/present tallies;
 * payroll absence weights (Saturday full miss = 1) come from summarizeMonthAbsence /
 * dayDeduction.
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
 * Monthly attendance summary: scheduled − present = absent, one per day.
 * Holidays and weekends are excluded from scheduled/present/absent.
 */
export function summarizeAttendanceDays(
  logs: ReadonlyArray<AttendanceAbsenceLog>,
): AttendanceDaySummary {
  const workingDayLogs = logs.filter(
    (log) => !log.isHoliday && !log.isWeekend,
  );

  const scheduledDays = workingDayLogs.length;
  const presentDays = workingDayLogs.filter((log) => log.wasPresent).length;

  return {
    scheduledDays: roundDays(scheduledDays),
    presentDays: roundDays(presentDays),
    absentDays: roundDays(Math.max(0, scheduledDays - presentDays)),
  };
}
