import { dateToYyyyMmDd } from '../services/attendance-leave.util';
import { ENROLMENT_GRACE_WORKING_DAYS } from './attendance-policy.constants';

/**
 * First N Mon–Sat non-holiday days from hire, before the first scanner punch,
 * are enrolment grace (not absent). Same window on weekdays and Saturdays.
 */
export function enrolmentGraceDateKeys(params: {
  hireDate: Date;
  /** Earliest calendar day with any clock-in/out (corrected or raw); null = none yet. */
  firstScanDate: Date | null;
  /** Inclusive upper bound when listing keys (typically month end). */
  throughDate: Date;
  isPublicHoliday: (date: Date) => boolean;
  graceWorkingDays?: number;
}): Set<string> {
  const graceDays = params.graceWorkingDays ?? ENROLMENT_GRACE_WORKING_DAYS;
  const keys = new Set<string>();
  if (graceDays <= 0) {
    return keys;
  }

  const hireKey = dateToYyyyMmDd(params.hireDate);
  const firstScanKey = params.firstScanDate
    ? dateToYyyyMmDd(params.firstScanDate)
    : null;
  const throughKey = dateToYyyyMmDd(params.throughDate);

  const cursor = new Date(
    Date.UTC(
      params.hireDate.getUTCFullYear(),
      params.hireDate.getUTCMonth(),
      params.hireDate.getUTCDate(),
    ),
  );
  let counted = 0;

  while (counted < graceDays) {
    const key = dateToYyyyMmDd(cursor);
    if (key > throughKey) {
      break;
    }
    // Grace only applies before the first scan day (scan day itself is normal).
    if (firstScanKey != null && key >= firstScanKey) {
      break;
    }

    const isSunday = cursor.getUTCDay() === 0;
    if (!isSunday && !params.isPublicHoliday(cursor)) {
      keys.add(key);
      counted += 1;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
    // Safety: do not walk forever if hire is far in the past without scans.
    if (key < hireKey) {
      break;
    }
  }

  return keys;
}

export function isEnrolmentGraceDate(
  date: Date,
  graceKeys: ReadonlySet<string>,
): boolean {
  return graceKeys.has(dateToYyyyMmDd(date));
}
