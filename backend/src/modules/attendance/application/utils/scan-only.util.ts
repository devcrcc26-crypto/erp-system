/**
 * Work schedule "scan only" mode (e.g. cleaners who scan once around 07:00 and
 * finish before office hours). Any scan that day counts as present; the
 * earliest scan after the schedule's latestScanTime is flagged for HR review.
 * Late minutes, early departure and missing-punch rules never apply.
 */

export const SCAN_ONLY_CHECK_MODE = 'SCAN_ONLY' as const;

export const SCAN_AFTER_DEADLINE_FLAG = 'SCAN_AFTER_DEADLINE' as const;

/** Schedule fields that decide whether a day is evaluated as scan only. */
export interface ScanOnlyScheduleLike {
  checkMode?: string | null;
  latestScanTime?: string | null;
}

/** Scan-only rule for one date (null on STANDARD schedules). */
export interface ScanOnlyRule {
  latestScanTime: string | null;
}

function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function isScanOnlySchedule(
  schedule: ScanOnlyScheduleLike | null | undefined,
): boolean {
  return schedule?.checkMode === SCAN_ONLY_CHECK_MODE;
}

export function scanOnlyRuleFor(
  schedule: ScanOnlyScheduleLike | null | undefined,
): ScanOnlyRule | null {
  if (!isScanOnlySchedule(schedule)) {
    return null;
  }
  return { latestScanTime: schedule?.latestScanTime ?? null };
}

/**
 * Earliest of the day's scans (HH:mm). The export only carries the first and
 * last punch, so this is min(clockIn, clockOut) over the non-empty values.
 */
export function earliestScan(
  clockIn: string | null | undefined,
  clockOut: string | null | undefined,
): string | null {
  const scans = [clockIn, clockOut].filter(
    (value): value is string => Boolean(value),
  );
  if (scans.length === 0) {
    return null;
  }
  return scans.reduce((min, value) =>
    toMinutes(value) < toMinutes(min) ? value : min,
  );
}

/** True when the earliest scan is strictly later than latestScanTime. */
export function isScanAfterDeadline(
  scanTime: string | null,
  latestScanTime: string | null,
): boolean {
  if (!scanTime || !latestScanTime) {
    return false;
  }
  return toMinutes(scanTime) > toMinutes(latestScanTime);
}
