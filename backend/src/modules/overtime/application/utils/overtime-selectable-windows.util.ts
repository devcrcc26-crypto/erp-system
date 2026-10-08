/**
 * Selectable overtime time windows for one employee on one calendar day.
 * New entries are same-day only (no overnight). End of day is "24:00".
 */

/** When false, the lunch gap between morning and afternoon is not OT. */
export const LUNCH_COUNTS_AS_OVERTIME = false;

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
  /** Half-day leave portions already converted to excluded HH:mm windows. */
  leaveExcludedWindows: Array<{ start: string; end: string }>;
  hasFullDayLeave: boolean;
}

export interface SelectableWindowsResult {
  dayKind: OvertimeDayKind;
  windows: TimeWindowHhMm[];
  blockedReason: 'FULL_DAY_LEAVE' | null;
  message: string | null;
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
 * Computes selectable OT windows for an employee on a date.
 */
export function computeSelectableOvertimeWindows(
  input: SelectableWindowsInput,
): SelectableWindowsResult {
  if (input.hasFullDayLeave) {
    return {
      dayKind: 'FULL_DAY_LEAVE',
      windows: [],
      blockedReason: 'FULL_DAY_LEAVE',
      message: "You're on approved leave this day.",
    };
  }

  const leaveExcluded = input.leaveExcludedWindows.map((w) => ({
    start: parseHhMmToMinutesStrict(w.start),
    end: parseHhMmToMinutesStrict(w.end),
  }));

  if (input.isHoliday || !input.isWorkingDay) {
    const windows = subtractWindows(
      [{ start: 0, end: END_OF_DAY_MINUTES }],
      leaveExcluded,
    );
    return {
      dayKind: input.isHoliday ? 'HOLIDAY' : 'NON_WORKING',
      windows: windows.map((w) => ({
        start: minutesToHhMm(w.start),
        end: minutesToHhMm(w.end),
      })),
      blockedReason: null,
      message: null,
    };
  }

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

  let base: Array<{ start: number; end: number }> = [];

  if (input.isHalfDay) {
    // Half day: before morning + after morning end through 24:00.
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
    // Full working day: before morning + after afternoon end.
    // Lunch is not selectable when LUNCH_COUNTS_AS_OVERTIME is false.
    if (morningStart != null && morningStart > 0) {
      base.push({ start: 0, end: morningStart });
    }
    if (afternoonEnd != null && afternoonEnd < END_OF_DAY_MINUTES) {
      base.push({ start: afternoonEnd, end: END_OF_DAY_MINUTES });
    }
    if (LUNCH_COUNTS_AS_OVERTIME && morningEnd != null && afternoonStart != null) {
      base.push({ start: morningEnd, end: afternoonStart });
    }
    if (base.length === 0) {
      base = [{ start: 0, end: END_OF_DAY_MINUTES }];
    }
  }

  const windows = subtractWindows(base, leaveExcluded);
  return {
    dayKind: input.isHalfDay ? 'HALF_DAY' : 'FULL_WORKING',
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
