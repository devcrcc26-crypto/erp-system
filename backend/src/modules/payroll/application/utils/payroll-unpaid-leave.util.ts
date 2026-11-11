/**
 * Payroll-side unpaid leave deduction helpers.
 * Attendance already subtracts UNPAID_LEAVE from paidDays when recalculated;
 * these cover missing attendance and stale paidDays (leave still shown as LEAVE/PRESENT).
 */

const MS_PER_DAY = 86_400_000;

export function dateKeyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Inclusive calendar days of periods overlapping [rangeStart, rangeEnd]. */
export function countCalendarDaysOverlap(
  periods: ReadonlyArray<{ startDate: Date; endDate: Date }>,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  let days = 0;
  for (const period of periods) {
    const startMs = Math.max(period.startDate.getTime(), rangeStart.getTime());
    const endMs = Math.min(period.endDate.getTime(), rangeEnd.getTime());
    if (startMs > endMs) {
      continue;
    }
    days += Math.floor((endMs - startMs) / MS_PER_DAY) + 1;
  }
  return days;
}

/** YYYY-MM-DD keys for each calendar day in periods ∩ [rangeStart, rangeEnd]. */
export function unpaidLeaveDateKeysInRange(
  periods: ReadonlyArray<{ startDate: Date; endDate: Date }>,
  rangeStart: Date,
  rangeEnd: Date,
): string[] {
  const keys: string[] = [];
  for (const period of periods) {
    const startMs = Math.max(period.startDate.getTime(), rangeStart.getTime());
    const endMs = Math.min(period.endDate.getTime(), rangeEnd.getTime());
    if (startMs > endMs) {
      continue;
    }
    const cursor = new Date(startMs);
    while (cursor.getTime() <= endMs) {
      keys.push(dateKeyUtc(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return keys;
}

export interface AttendanceLogForUnpaid {
  date: Date;
  dayDeduction: number;
  dayStatus?: string | null;
}

/**
 * How many unpaid-leave calendar days still need to reduce payrollDays.
 * Skips days already reflected as UNPAID_LEAVE / INACTIVE, or with dayDeduction &gt; 0
 * (already in absentDays / paidDays).
 */
export function unpaidLeaveDaysStillToDeduct(params: {
  unpaidDateKeys: readonly string[];
  dailyLogs?: readonly AttendanceLogForUnpaid[] | null;
}): number {
  const { unpaidDateKeys, dailyLogs } = params;
  if (unpaidDateKeys.length === 0) {
    return 0;
  }
  if (!dailyLogs || dailyLogs.length === 0) {
    return unpaidDateKeys.length;
  }

  const byDate = new Map<string, AttendanceLogForUnpaid>();
  for (const log of dailyLogs) {
    byDate.set(dateKeyUtc(log.date), log);
  }

  let missing = 0;
  for (const key of unpaidDateKeys) {
    const log = byDate.get(key);
    if (!log) {
      missing += 1;
      continue;
    }
    if (log.dayStatus === 'UNPAID_LEAVE' || log.dayStatus === 'INACTIVE') {
      continue;
    }
    if (log.dayDeduction > 0) {
      continue;
    }
    missing += 1;
  }
  return missing;
}
