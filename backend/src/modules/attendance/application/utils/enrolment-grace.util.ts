import { dateToYyyyMmDd } from '../services/attendance-leave.util';

function utcDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number): Date {
  const next = utcDateOnly(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Enrolment grace for employees not yet on the scanner (or just enrolled):
 * from signed/hire date through the calendar day after the first scan.
 * No-scan WORKING / HALF_DAY (non-holiday) days in that window → ENROLMENT_GRACE.
 * If there is no scan yet, grace runs through `throughDate`.
 */
export function enrolmentGraceDateKeys(params: {
  hireDate: Date;
  /** Earliest calendar day with any clock-in/out (corrected or raw); null = none yet. */
  firstScanDate: Date | null;
  /** Inclusive upper bound when listing keys (typically month end). */
  throughDate: Date;
  isPublicHoliday: (date: Date) => boolean;
  /**
   * Schedule day off (not a duty day). When omitted, calendar Sunday is treated
   * as day off (legacy Mon–Sat grace).
   */
  isDayOff?: (date: Date) => boolean;
  /** enrolmentGraceWorkingDays policy: cap on grace working days; null = no cap. */
  maxWorkingDays?: number | null;
}): Set<string> {
  const keys = new Set<string>();
  const hire = utcDateOnly(params.hireDate);
  const through = utcDateOnly(params.throughDate);

  let graceEnd: Date;
  if (params.firstScanDate) {
    graceEnd = addUtcDays(utcDateOnly(params.firstScanDate), 1);
  } else {
    graceEnd = through;
  }

  if (graceEnd.getTime() < hire.getTime()) {
    return keys;
  }

  const effectiveEnd =
    graceEnd.getTime() <= through.getTime() ? graceEnd : through;

  const cap = params.maxWorkingDays ?? null;
  const cursor = new Date(hire.getTime());
  while (cursor.getTime() <= effectiveEnd.getTime()) {
    if (cap != null && keys.size >= cap) break;
    const isOff =
      params.isDayOff?.(cursor) ?? cursor.getUTCDay() === 0;
    if (!isOff && !params.isPublicHoliday(cursor)) {
      keys.add(dateToYyyyMmDd(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

export function isEnrolmentGraceDate(
  date: Date,
  graceKeys: ReadonlySet<string>,
): boolean {
  return graceKeys.has(dateToYyyyMmDd(date));
}
