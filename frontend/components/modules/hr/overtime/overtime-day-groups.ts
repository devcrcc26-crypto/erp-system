/** Group overtime sheet entries by calendar day for the entries table. */

import type { OvertimeEntry } from '@/lib/api/overtime.types';
import { parseHhMmToMinutes } from '@/components/modules/hr/overtime/overtime-time-periods';

export interface OvertimeDayGroup {
  /** Stable row key — the calendar date (YYYY-MM-DD). */
  key: string;
  date: string;
  entries: OvertimeEntry[];
  regularHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
  totalHours: number;
  siteWithinScheduleHours: number;
  isHoliday: boolean;
  isOvernight: boolean;
  holidayName: string | null;
  attendanceWarning: string | null;
  siteAssignmentId: string | null;
  siteName: string | null;
  siteReviewFlag: OvertimeEntry['siteReviewFlag'];
  documents: NonNullable<OvertimeEntry['documents']>;
}

function sortEntriesByStart(entries: OvertimeEntry[]): OvertimeEntry[] {
  return [...entries].sort(
    (a, b) =>
      parseHhMmToMinutes(a.startTime) - parseHhMmToMinutes(b.startTime) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Collapse same-day overtime periods into one table row. Hours are summed;
 * periods stay available via `entries` for edit / attachments.
 */
export function groupOvertimeEntriesByDate(
  entries: OvertimeEntry[],
): OvertimeDayGroup[] {
  const byDate = new Map<string, OvertimeEntry[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.date) ?? [];
    list.push(entry);
    byDate.set(entry.date, list);
  }

  const dates = [...byDate.keys()].sort();
  return dates.map((date) => {
    const dayEntries = sortEntriesByStart(byDate.get(date) ?? []);
    const documents = dayEntries.flatMap((entry) => entry.documents ?? []);
    const siteEntry =
      dayEntries.find((entry) => entry.siteAssignmentId) ?? dayEntries[0]!;
    const flagged = dayEntries.find((entry) => entry.siteReviewFlag);

    return {
      key: date,
      date,
      entries: dayEntries,
      regularHours: dayEntries.reduce((s, e) => s + Number(e.regularHours), 0),
      nightHours: dayEntries.reduce((s, e) => s + Number(e.nightHours), 0),
      weekendHours: dayEntries.reduce((s, e) => s + Number(e.weekendHours), 0),
      holidayHours: dayEntries.reduce((s, e) => s + Number(e.holidayHours), 0),
      totalHours: dayEntries.reduce((s, e) => s + Number(e.totalHours), 0),
      siteWithinScheduleHours: dayEntries.reduce(
        (s, e) => s + Number(e.siteWithinScheduleHours ?? 0),
        0,
      ),
      isHoliday: dayEntries.some(
        (e) => e.isHoliday || Number(e.holidayHours) > 0,
      ),
      isOvernight: dayEntries.some((e) => e.isOvernight),
      holidayName:
        dayEntries.map((e) => e.holidayName).find(Boolean) ?? null,
      attendanceWarning:
        dayEntries.map((e) => e.attendanceWarning).find(Boolean) ?? null,
      siteAssignmentId: siteEntry.siteAssignmentId ?? null,
      siteName: siteEntry.siteName ?? null,
      siteReviewFlag: flagged?.siteReviewFlag ?? null,
      documents,
    };
  });
}
