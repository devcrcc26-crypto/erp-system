/**
 * Import-time attendance day counts, before the month is recomputed with
 * summarizeMonthAbsence (which then sets scheduled / present / absent / paid).
 * Every working day counts 1, Saturday included - a half-day schedule never
 * makes a day 0.5. Payroll paid/absent days come from summarizeMonthAbsence.
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
