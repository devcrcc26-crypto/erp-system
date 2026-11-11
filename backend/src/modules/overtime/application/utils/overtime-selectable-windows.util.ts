/**
 * Selectable overtime time windows for one employee on one calendar day.
 * New entries are same-day only (no overnight). End of day is "24:00".
 */

import { POLICY_DEFAULTS } from '../../../../shared/policy/policy-definitions';

export const END_OF_DAY_HHMM = '24:00';

/** Minutes from midnight; 1440 = end of calendar day (24:00). */
export const END_OF_DAY_MINUTES = 24 * 60;

export type OvertimeDayKind =
  | 'FULL_WORKING'
  | 'HALF_DAY'
  | 'NON_WORKING'
  | 'HOLIDAY'
  | 'FULL_DAY_LEAVE';

export interface TimeWindowHhMm {
  start: string;
  end: string;
}

export interface SelectableWindowsInput {
  isHoliday: boolean;
  isWorkingDay: boolean;
  isHalfDay: boolean;
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
  /**
   * Leave (full or half) already converted to duty-hour HH:mm windows to carve out.
   * Full-day leave must list scheduled working hours only — not 00:00–24:00.
   */
  leaveExcludedWindows: Array<{ start: string; end: string }>;
  /**
   * @deprecated Ignored. Full-day leave is applied via leaveExcludedWindows
   * so OT outside duty hours stays selectable.
   */
  hasFullDayLeave?: boolean;
  /** Policy lunchCountsAsOvertime as of the date; when false the lunch gap is not selectable. */
  lunchCountsAsOvertime?: boolean;
  /** Site-assignment day: full calendar day (duty hours are not hidden). */
  scheduledHoursClaimable?: boolean;
}

export interface SelectableWindowsResult {
  dayKind: OvertimeDayKind;
  windows: TimeWindowHhMm[];
  /** Always null — full-day leave no longer blocks the whole calendar day. */
  blockedReason: 'FULL_DAY_LEAVE' | null;
  message: string | null;
  /** True when an approved site assignment covers this calendar day. */
  siteAssignmentDay?: boolean;
  siteName?: string | null;
}

export function parseHhMmToMinutesStrict(value: string): number {
  if (value === END_OF_DAY_HHMM) {
    return END_OF_DAY_MINUTES;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid time: ${value}`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === 24 && minutes === 0) {
    return END_OF_DAY_MINUTES;
  }
  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid time: ${value}`);
  }
  return hours * 60 + minutes;
}

export function minutesToHhMm(minutes: number): string {
  if (minutes >= END_OF_DAY_MINUTES) {
    return END_OF_DAY_HHMM;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function subtractWindows(
  base: Array<{ start: number; end: number }>,
  excluded: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  let result = [...base];
  for (const ex of excluded) {
    const next: Array<{ start: number; end: number }> = [];
    for (const win of result) {
      if (ex.end <= win.start || ex.start >= win.end) {
        next.push(win);
        continue;
      }
      if (ex.start > win.start) {
        next.push({ start: win.start, end: Math.min(ex.start, win.end) });
      }
      if (ex.end < win.end) {
        next.push({ start: Math.max(ex.end, win.start), end: win.end });
      }
    }
    result = next.filter((w) => w.end - w.start >= 15);
  }
  return result;
}

/**
 * True when half-open intervals [aStart, aEnd) and [bStart, bEnd) overlap.
 */
export function timeIntervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Removes already-booked intervals from selectable HH:mm windows
 * (e.g. existing overtime entries on the same sheet/date).
 */
export function subtractOccupiedFromWindows(
  windows: TimeWindowHhMm[],
  occupied: TimeWindowHhMm[],
): TimeWindowHhMm[] {
  if (windows.length === 0 || occupied.length === 0) {
    return windows;
  }
  const remaining = subtractWindows(
    windows.map((w) => ({
      start: parseHhMmToMinutesStrict(w.start),
      end: parseHhMmToMinutesStrict(w.end),
    })),
    occupied.map((w) => ({
      start: parseHhMmToMinutesStrict(w.start),
      end: parseHhMmToMinutesStrict(w.end),
    })),
  );
  return remaining.map((w) => ({
    start: minutesToHhMm(w.start),
    end: minutesToHhMm(w.end),
  }));
}

/**
 * Maps a stored same-day (or overnight) entry onto an occupied window clipped
 * to that calendar day [00:00, 24:00).
 */
export function entryToSameDayOccupiedWindow(entry: {
  startHhMm: string;
  endHhMm: string;
  endsAtEndOfDay?: boolean;
  isOvernight?: boolean;
}): TimeWindowHhMm | null {
  const start = parseHhMmToMinutesStrict(entry.startHhMm);
  let end: number;
  if (
    entry.endsAtEndOfDay ||
    (!entry.isOvernight &&
      (entry.endHhMm === END_OF_DAY_HHMM ||
        entry.endHhMm === '24:00' ||
        parseHhMmToMinutesStrict(entry.endHhMm) === 0))
  ) {
    end = END_OF_DAY_MINUTES;
  } else if (entry.isOvernight) {
    // Overnight entries occupy the remainder of the start day for same-day pickers.
    end = END_OF_DAY_MINUTES;
  } else {
    end = parseHhMmToMinutesStrict(entry.endHhMm);
  }
  if (end <= start) {
    return null;
  }
  return {
    start: minutesToHhMm(start),
    end: minutesToHhMm(end),
  };
}

/**
 * Computes selectable OT windows for an employee on a date.
 */
export function computeSelectableOvertimeWindows(
  input: SelectableWindowsInput,
): SelectableWindowsResult {
  // Full-day leave is expressed as duty-hour leaveExcludedWindows only.
  // OT outside scheduled working hours stays selectable.
  const leaveExcluded = input.leaveExcludedWindows.map((w) => ({
    start: parseHhMmToMinutesStrict(w.start),
    end: parseHhMmToMinutesStrict(w.end),
  }));

  let dayKind: OvertimeDayKind;
  if (input.isHoliday) {
    dayKind = 'HOLIDAY';
  } else if (!input.isWorkingDay) {
    dayKind = 'NON_WORKING';
  } else if (input.isHalfDay) {
    dayKind = 'HALF_DAY';
  } else {
    dayKind = 'FULL_WORKING';
  }

  let base: Array<{ start: number; end: number }> = [];
  const lunchCounts =
    input.lunchCountsAsOvertime ?? POLICY_DEFAULTS.lunchCountsAsOvertime;

  if (input.scheduledHoursClaimable) {
    // Site assignment: any time on the calendar day (leave still carved out).
    base = [{ start: 0, end: END_OF_DAY_MINUTES }];
  } else if (input.isHoliday || !input.isWorkingDay) {
    base = [{ start: 0, end: END_OF_DAY_MINUTES }];
  } else if (input.isHalfDay) {
    const morningStart = input.morningStart
      ? parseHhMmToMinutesStrict(input.morningStart)
      : null;
    const morningEnd = input.morningEnd
      ? parseHhMmToMinutesStrict(input.morningEnd)
      : null;
    if (morningStart != null && morningStart > 0) {
      base.push({ start: 0, end: morningStart });
    }
    if (morningEnd != null && morningEnd < END_OF_DAY_MINUTES) {
      base.push({ start: morningEnd, end: END_OF_DAY_MINUTES });
    }
    if (base.length === 0) {
      base = [{ start: 0, end: END_OF_DAY_MINUTES }];
    }
  } else {
    const morningStart = input.morningStart
      ? parseHhMmToMinutesStrict(input.morningStart)
      : null;
    const morningEnd = input.morningEnd
      ? parseHhMmToMinutesStrict(input.morningEnd)
      : null;
    const afternoonStart = input.afternoonStart
      ? parseHhMmToMinutesStrict(input.afternoonStart)
      : null;
    const afternoonEnd = input.afternoonEnd
      ? parseHhMmToMinutesStrict(input.afternoonEnd)
      : null;
    const dutyEnd =
      afternoonEnd ?? (afternoonStart == null ? morningEnd : null);
    if (morningStart != null && morningStart > 0) {
      base.push({ start: 0, end: morningStart });
    }
    if (dutyEnd != null && dutyEnd < END_OF_DAY_MINUTES) {
      base.push({ start: dutyEnd, end: END_OF_DAY_MINUTES });
    }
    if (lunchCounts && morningEnd != null && afternoonStart != null) {
      base.push({ start: morningEnd, end: afternoonStart });
    }
    if (base.length === 0) {
      base = [{ start: 0, end: END_OF_DAY_MINUTES }];
    }
  }

  const windows = subtractWindows(base, leaveExcluded);

  return {
    dayKind,
    windows: windows.map((w) => ({
      start: minutesToHhMm(w.start),
      end: minutesToHhMm(w.end),
    })),
    blockedReason: null,
    message: null,
  };
}

/**
 * True when [start, end) lies entirely inside one selectable window.
 * End may be 24:00. Start must be strictly before end (same day).
 */
export function isIntervalInsideSelectableWindows(
  startHhMm: string,
  endHhMm: string,
  windows: TimeWindowHhMm[],
): boolean {
  const start = parseHhMmToMinutesStrict(startHhMm);
  const end = parseHhMmToMinutesStrict(endHhMm);
  if (end <= start) {
    return false;
  }
  return windows.some((w) => {
    const ws = parseHhMmToMinutesStrict(w.start);
    const we = parseHhMmToMinutesStrict(w.end);
    return start >= ws && end <= we;
  });
}

/**
 * Same-day OT: the whole [start, end] interval must sit inside one selectable
 * window (scheduled duty is not selectable on non-site days).
 */
export function isSameDayOvertimeIntervalAllowed(
  startHhMm: string,
  endHhMm: string,
  windows: TimeWindowHhMm[],
): boolean {
  const start = parseHhMmToMinutesStrict(startHhMm);
  const end = parseHhMmToMinutesStrict(endHhMm);
  if (end <= start || end > END_OF_DAY_MINUTES) {
    return false;
  }
  return windows.some((w) => {
    const ws = parseHhMmToMinutesStrict(w.start);
    const we = parseHhMmToMinutesStrict(w.end);
    return start >= ws && end <= we;
  });
}

export type OutsideSelectableReason =
  | 'END_BEFORE_START'
  | 'NO_WINDOWS'
  | 'OVERLAPS_LEAVE'
  | 'START_IN_SCHEDULE'
  | 'CROSSES_SCHEDULE'
  | 'OTHER';

/**
 * Explains why a same-day interval is rejected against selectable OT windows.
 * Leave carve-outs are checked explicitly so callers do not blame "overlap with
 * another entry" when the real issue is schedule or leave.
 */
export function explainOutsideSelectableWindow(
  startHhMm: string,
  endHhMm: string,
  windows: TimeWindowHhMm[],
  leaveExcludedWindows: TimeWindowHhMm[] = [],
): OutsideSelectableReason {
  const start = parseHhMmToMinutesStrict(startHhMm);
  const end = parseHhMmToMinutesStrict(endHhMm);
  if (end <= start || end > END_OF_DAY_MINUTES) {
    return 'END_BEFORE_START';
  }
  if (windows.length === 0) {
    return 'NO_WINDOWS';
  }
  for (const leave of leaveExcludedWindows) {
    const ls = parseHhMmToMinutesStrict(leave.start);
    const le = parseHhMmToMinutesStrict(leave.end);
    if (timeIntervalsOverlap(start, end, ls, le)) {
      return 'OVERLAPS_LEAVE';
    }
  }
  const startInWindow = windows.some((w) => {
    const ws = parseHhMmToMinutesStrict(w.start);
    const we = parseHhMmToMinutesStrict(w.end);
    return start >= ws && start < we;
  });
  if (!startInWindow) {
    return 'START_IN_SCHEDULE';
  }
  return 'CROSSES_SCHEDULE';
}

/** 15-minute ticks from window start inclusive to window end inclusive (for end times). */
export function enumerateWindowTimes(
  window: TimeWindowHhMm,
  options: { forEndTime: boolean; afterMinutes?: number },
): string[] {
  const start = parseHhMmToMinutesStrict(window.start);
  const end = parseHhMmToMinutesStrict(window.end);
  const times: string[] = [];
  const step = 15;
  if (options.forEndTime) {
    const after = options.afterMinutes ?? start;
    for (let m = after + step; m <= end; m += step) {
      times.push(minutesToHhMm(m));
    }
  } else {
    for (let m = start; m < end; m += step) {
      times.push(minutesToHhMm(m));
    }
  }
  return times;
}
