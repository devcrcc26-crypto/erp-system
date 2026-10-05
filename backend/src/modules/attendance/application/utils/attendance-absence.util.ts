/**
 * Shared attendance day weighting for monthly summaries and payroll.
 * Half-day schedule days (e.g. Saturday) count as 0.5; full days as 1.
 * Presence is binary (wasPresent) — same rule as AttendanceService.
 */

export interface AttendanceAbsenceLog {
  date: Date;
  isHoliday: boolean;
  isWeekend: boolean;
  wasPresent: boolean;
  isHalfDay: boolean;
}

export interface DateWindow {
  windowStart: Date;
  windowEnd: Date;
}

export interface AttendanceDaySummary {
  scheduledDays: number;
  presentDays: number;
  absentDays: number;
}

export interface AbsentInWindowResult {
  /** Weighted absent days (half-day = 0.5). */
  absentDays: number;
  /** YYYY-MM-DD keys for absent working days in the window. */
  absentDates: string[];
  /** Weight per absent date (0.5 or 1). */
  absentDateWeights: Map<string, number>;
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

function toYyyyMmDd(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isInWindows(date: Date, windows: DateWindow[]): boolean {
  if (windows.length === 0) {
    return false;
  }
  const t = date.getTime();
  return windows.some(
    (w) => t >= w.windowStart.getTime() && t <= w.windowEnd.getTime(),
  );
}

/**
 * Monthly attendance summary: scheduled − present = absent, with half-day weights.
 * Holidays and weekends are excluded from scheduled/present/absent.
 */
export function summarizeAttendanceDays(
  logs: ReadonlyArray<
    Pick<
      AttendanceAbsenceLog,
      'isHoliday' | 'isWeekend' | 'wasPresent' | 'isHalfDay'
    >
  >,
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

/**
 * Weighted absent working days whose date falls inside any employment window.
 */
export function countAbsentDaysInWindows(
  logs: ReadonlyArray<AttendanceAbsenceLog>,
  windows: ReadonlyArray<DateWindow>,
): AbsentInWindowResult {
  const absentDates: string[] = [];
  const absentDateWeights = new Map<string, number>();
  let absentDays = 0;

  if (windows.length === 0) {
    return { absentDays: 0, absentDates, absentDateWeights };
  }

  for (const log of logs) {
    if (log.isHoliday || log.isWeekend || log.wasPresent) {
      continue;
    }
    if (!isInWindows(log.date, windows as DateWindow[])) {
      continue;
    }
    const key = toYyyyMmDd(log.date);
    const weight = workingDayWeight(log.isHalfDay);
    absentDates.push(key);
    absentDateWeights.set(key, weight);
    absentDays += weight;
  }

  return {
    absentDays: roundDays(absentDays),
    absentDates,
    absentDateWeights,
  };
}

/**
 * Sum of absence weights for leave-covered dates that are also absent.
 */
export function sumLeaveCoveredAbsentWeight(
  coveredDates: ReadonlyArray<string>,
  absentDateWeights: ReadonlyMap<string, number>,
): number {
  let total = 0;
  for (const date of coveredDates) {
    const weight = absentDateWeights.get(date);
    if (weight != null) {
      total += weight;
    }
  }
  return roundDays(total);
}
