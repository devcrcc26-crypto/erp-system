/** Shared helpers for same-day overtime time periods in the entry form. */

export const END_OF_DAY = '24:00';
export const LUNCH_START_MINUTES = 12 * 60 + 30;
export const LUNCH_END_MINUTES = 13 * 60 + 30;
export const LUNCH_END_HHMM = '13:30';
const MINUTES_PER_DAY = 24 * 60;

export interface OvertimeTimeWindow {
  start: string;
  end: string;
}

export interface OvertimeTimePeriodRow {
  startTime?: string;
  endTime?: string;
  taskDescription?: string;
}

export function parseHhMmToMinutes(value: string): number {
  if (value === END_OF_DAY || value === '24:00') {
    return MINUTES_PER_DAY;
  }
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToHhMm(minutes: number): string {
  if (minutes >= MINUTES_PER_DAY) {
    return END_OF_DAY;
  }
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Duration in hours. `24:00` is 1440 minutes (exact midnight / end of day).
 * Example: 22:00→24:00 = (1440−1320)/60 = 2.00
 */
export function calculateOTHours(startTime: string, endTime: string): number {
  const start = parseHhMmToMinutes(startTime);
  const end = parseHhMmToMinutes(endTime);
  if (end <= start) {
    return 0;
  }
  return (end - start) / 60;
}

export function isInsideWeekdayLunch(minutes: number): boolean {
  return minutes >= LUNCH_START_MINUTES && minutes < LUNCH_END_MINUTES;
}

/**
 * Weekday lunch exclusion for OT pickers. Skip Sat/Sun, holidays, and site days.
 */
export function shouldExcludeWeekdayLunchFromWindows(
  date: { day: () => number } | null | undefined,
  windows: {
    siteAssignmentDay?: boolean;
    dayKind?: string;
  } | null,
): boolean {
  if (!date || !windows) {
    return false;
  }
  if (windows.siteAssignmentDay) {
    return false;
  }
  if (windows.dayKind === 'HOLIDAY') {
    return false;
  }
  const day = date.day();
  return day >= 1 && day <= 5;
}

export function snapStartPastWeekdayLunch(startTime: string): string {
  const minutes = parseHhMmToMinutes(startTime);
  if (isInsideWeekdayLunch(minutes)) {
    return LUNCH_END_HHMM;
  }
  return startTime;
}

export function preferredOvertimeStart(
  windows: OvertimeTimeWindow[],
): string | undefined {
  if (windows.length === 0) {
    return undefined;
  }
  let best = windows[0]!;
  let bestSpan =
    parseHhMmToMinutes(best.end) - parseHhMmToMinutes(best.start);
  for (let i = 1; i < windows.length; i += 1) {
    const window = windows[i]!;
    const span =
      parseHhMmToMinutes(window.end) - parseHhMmToMinutes(window.start);
    if (span >= bestSpan) {
      best = window;
      bestSpan = span;
    }
  }
  return best.start;
}

export function enumerateEndTimesInWindows(
  startTime: string,
  windows: OvertimeTimeWindow[],
  options?: { excludeWeekdayLunch?: boolean },
): string[] {
  const start = parseHhMmToMinutes(startTime);
  const containing = windows.find((window) => {
    const ws = parseHhMmToMinutes(window.start);
    const we = parseHhMmToMinutes(window.end);
    return start >= ws && start < we;
  });
  if (!containing) {
    return [];
  }

  let maxEnd = parseHhMmToMinutes(containing.end);
  if (options?.excludeWeekdayLunch && start < LUNCH_START_MINUTES) {
    maxEnd = Math.min(maxEnd, LUNCH_START_MINUTES);
  }

  const times: string[] = [];
  for (let m = start + 1; m <= maxEnd; m += 1) {
    if (options?.excludeWeekdayLunch && isInsideWeekdayLunch(m)) {
      continue;
    }
    times.push(minutesToHhMm(m));
  }
  return times;
}

export function enumerateStartTimes(
  windows: OvertimeTimeWindow[],
  options?: { excludeWeekdayLunch?: boolean },
): string[] {
  const times = new Set<string>();
  for (const window of windows) {
    const ws = parseHhMmToMinutes(window.start);
    const we = parseHhMmToMinutes(window.end);
    for (let m = ws; m < we; m += 1) {
      if (options?.excludeWeekdayLunch && isInsideWeekdayLunch(m)) {
        continue;
      }
      times.add(minutesToHhMm(m));
    }
  }
  return [...times].sort(
    (a, b) => parseHhMmToMinutes(a) - parseHhMmToMinutes(b),
  );
}

function subtractWindowsMinutes(
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

/** Carve occupied HH:mm intervals out of selectable OT windows. */
export function subtractOccupiedFromWindows(
  windows: OvertimeTimeWindow[],
  occupied: OvertimeTimeWindow[],
): OvertimeTimeWindow[] {
  if (windows.length === 0 || occupied.length === 0) {
    return windows;
  }
  const remaining = subtractWindowsMinutes(
    windows.map((w) => ({
      start: parseHhMmToMinutes(w.start),
      end: parseHhMmToMinutes(w.end),
    })),
    occupied.map((w) => ({
      start: parseHhMmToMinutes(w.start),
      end: parseHhMmToMinutes(w.end),
    })),
  );
  return remaining.map((w) => ({
    start: minutesToHhMm(w.start),
    end: minutesToHhMm(w.end),
  }));
}

export function completeOvertimePeriods(
  periods: OvertimeTimePeriodRow[],
): Array<{ startTime: string; endTime: string; taskDescription: string }> {
  return periods
    .filter(
      (row): row is OvertimeTimePeriodRow & {
        startTime: string;
        endTime: string;
      } => Boolean(row.startTime && row.endTime),
    )
    .map((row) => ({
      startTime: row.startTime,
      endTime: row.endTime,
      taskDescription: (row.taskDescription ?? '').trim(),
    }));
}

export function formatPeriodTimeSummary(row: OvertimeTimePeriodRow): string {
  if (!row.startTime || !row.endTime) {
    return '—';
  }
  return `${row.startTime} → ${row.endTime}`;
}

/** True when any two complete periods overlap on the same day. */
export function overtimePeriodsOverlap(
  periods: OvertimeTimePeriodRow[],
): boolean {
  const complete = completeOvertimePeriods(periods);
  for (let i = 0; i < complete.length; i += 1) {
    const aStart = parseHhMmToMinutes(complete[i]!.startTime);
    const aEnd = parseHhMmToMinutes(complete[i]!.endTime);
    for (let j = i + 1; j < complete.length; j += 1) {
      const bStart = parseHhMmToMinutes(complete[j]!.startTime);
      const bEnd = parseHhMmToMinutes(complete[j]!.endTime);
      if (aStart < bEnd && aEnd > bStart) {
        return true;
      }
    }
  }
  return false;
}

/** Windows available for one period after carving out sibling draft periods. */
export function windowsForPeriodIndex(
  baseWindows: OvertimeTimeWindow[],
  periods: OvertimeTimePeriodRow[],
  index: number,
): OvertimeTimeWindow[] {
  const occupied = periods
    .map((row, i) =>
      i !== index && row.startTime && row.endTime
        ? { start: row.startTime, end: row.endTime }
        : null,
    )
    .filter((row): row is OvertimeTimeWindow => row != null);
  return subtractOccupiedFromWindows(baseWindows, occupied);
}

/** Hours that appear in an allow-list of HH:mm / 24:00 values. */
export function allowedHoursFromTimes(
  allowed: string[],
  options?: { includeEndOfDay?: boolean },
): number[] {
  const hours = new Set<number>();
  for (const value of allowed) {
    if (value === END_OF_DAY) {
      if (options?.includeEndOfDay) {
        hours.add(24);
      }
      continue;
    }
    hours.add(Math.floor(parseHhMmToMinutes(value) / 60));
  }
  return [...hours].sort((a, b) => a - b);
}

/** Minutes allowed for a given hour from an allow-list. Hour 24 → [0] only. */
export function allowedMinutesForHour(
  allowed: string[],
  hour: number,
): number[] {
  if (hour === 24) {
    return allowed.includes(END_OF_DAY) ? [0] : [];
  }
  const minutes = new Set<number>();
  for (const value of allowed) {
    if (value === END_OF_DAY) {
      continue;
    }
    const total = parseHhMmToMinutes(value);
    if (Math.floor(total / 60) === hour) {
      minutes.add(total % 60);
    }
  }
  return [...minutes].sort((a, b) => a - b);
}
