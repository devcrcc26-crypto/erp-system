/**
 * Schedule-aware day classification for attendance, leave, overtime, and payroll.
 * Prefer this over calendar Mon–Sat / Sunday hard-codes.
 */

export type DayKind = 'WORKING' | 'HALF_DAY' | 'DAY_OFF' | 'HOLIDAY';

export interface ScheduleDayFlags {
  isWorkingDay: boolean;
  isHalfDay: boolean;
}

/**
 * Classifies a calendar day from holiday + schedule flags.
 * Holiday always wins over schedule.
 */
export function getDayKind(input: {
  isHoliday: boolean;
  isWorkingDay: boolean;
  isHalfDay: boolean;
}): DayKind {
  if (input.isHoliday) {
    return 'HOLIDAY';
  }
  if (!input.isWorkingDay) {
    return 'DAY_OFF';
  }
  if (input.isHalfDay) {
    return 'HALF_DAY';
  }
  return 'WORKING';
}

/** Duty days that count for absence, grace, COVERED, and Explain-days. */
export function isDutyDayKind(kind: DayKind): boolean {
  return kind === 'WORKING' || kind === 'HALF_DAY';
}

/**
 * Default schedule when no assignment or company default exists:
 * Mon–Fri full, Saturday half day, Sunday off (legacy attendance behaviour).
 */
export function defaultScheduleDayFlags(dayOfWeek: number): ScheduleDayFlags {
  if (dayOfWeek === 0) {
    return { isWorkingDay: false, isHalfDay: false };
  }
  if (dayOfWeek === 6) {
    return { isWorkingDay: true, isHalfDay: true };
  }
  return { isWorkingDay: true, isHalfDay: false };
}

/**
 * Resolves day kind from holiday + optional schedule row, falling back to
 * {@link defaultScheduleDayFlags}.
 */
export function resolveDayKindForDate(
  date: Date,
  isHoliday: boolean,
  scheduleDay: ScheduleDayFlags | null | undefined,
): DayKind {
  const flags = scheduleDay ?? defaultScheduleDayFlags(date.getUTCDay());
  return getDayKind({
    isHoliday,
    isWorkingDay: flags.isWorkingDay,
    isHalfDay: flags.isHalfDay,
  });
}
