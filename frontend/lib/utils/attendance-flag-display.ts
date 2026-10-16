import type {
  AttendanceDailyLog,
  AttendanceDayFlag,
  FieldMovementReason,
} from '@/lib/api/attendance.types';

const UNRESOLVED_FLAG_LABEL: Record<
  Exclude<AttendanceDayFlag, 'NONE'>,
  string
> = {
  MISSING_CLOCK_IN: 'Missing clock-in',
  MISSING_CLOCK_OUT: 'Missing clock-out',
  EARLY_LEAVE: 'Early departure',
  ON_LEAVE_BUT_SCANNED: 'On leave but scanned',
  SCAN_AFTER_SEPARATION: 'Scanned after leaving date',
};

const RESOLVED_REASON_LABEL: Record<FieldMovementReason, string> = {
  FIELD_VISIT: 'Field visit',
  EARLY_LEAVE: 'Confirmed early leave',
  FORGOT_CLOCK_IN: 'Forgot to scan in',
  FORGOT_CLOCK_OUT: 'Forgot to scan out',
};

/**
 * Display label for an attendance day flag, including resolved explanations.
 */
export function formatAttendanceDayFlag(
  log: Pick<
    AttendanceDailyLog,
    'flag' | 'flagResolved' | 'fieldMovementEntries' | 'isEarlyLeave'
  >,
): string {
  if (log.flag === 'NONE' && !log.flagResolved && !log.isEarlyLeave) {
    return '-';
  }

  const reason = log.fieldMovementEntries?.[0]?.reason as
    | FieldMovementReason
    | undefined;

  if (log.flagResolved || (log.flag === 'NONE' && reason)) {
    const reasonLabel = reason
      ? RESOLVED_REASON_LABEL[reason] ?? reason
      : log.isEarlyLeave
        ? RESOLVED_REASON_LABEL.EARLY_LEAVE
        : 'Resolved';
    return `✅ Resolved - ${reasonLabel}`;
  }

  if (log.flag === 'NONE') {
    return '-';
  }

  const prefix =
    log.flag === 'MISSING_CLOCK_IN'
      ? '🔴'
      : log.flag === 'EARLY_LEAVE'
        ? '🟠'
        : '🟡';

  return `${prefix} ${UNRESOLVED_FLAG_LABEL[log.flag]}`;
}

/**
 * Ant Design Tag color for a daily-log flag cell.
 */
export function attendanceFlagTagColor(
  log: Pick<AttendanceDailyLog, 'flag' | 'flagResolved'>,
): string {
  if (log.flagResolved || log.flag === 'NONE') {
    return 'success';
  }
  if (log.flag === 'EARLY_LEAVE') {
    return 'gold';
  }
  return 'orange';
}
