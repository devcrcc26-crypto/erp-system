/**
 * Cross-module day coverage: a day already covered by leave, site assignment,
 * work from home, or field movement must not be covered again by another of
 * those. Attendance scans are available after month-end and must not hard-block
 * create-time requests (ATTENDANCE remains loadable for legacy/read paths only).
 * Pure rules + messages; loading lives in DayCoverageService.
 */

export type CoverModule =
  | 'LEAVE'
  | 'SITE_ASSIGNMENT'
  | 'WORK_FROM_HOME'
  | 'FIELD_MOVEMENT'
  | 'ATTENDANCE';

export type CoverState = 'APPROVED' | 'REQUESTED';

export interface DayCover {
  /** YYYY-MM-DD */
  date: string;
  module: CoverModule;
  state: CoverState;
  reference?: string | null;
}

export interface CoverCheckDay {
  date: Date;
  /** Half-day leave: scans for the other half are expected, so attendance does not conflict. */
  halfDay?: boolean;
  /**
   * Schedule day off. When omitted, calendar Sunday is treated as day off
   * (legacy). Day-offs are never credited by coverage modules.
   */
  isDayOff?: boolean;
}

export interface CoverSources {
  leaves: Array<{
    status: string;
    requestNumber?: string | null;
    periods: Array<{ startDate: Date; endDate: Date }>;
  }>;
  siteAssignments: Array<{
    status: string;
    requestNumber?: string | null;
    startDate: Date;
    endDate: Date;
  }>;
  /** Date keys with approved work-from-home credit for the employee. */
  workFromHomeApproved: ReadonlySet<string>;
  /** Date key → request number of a pending work-from-home request. */
  workFromHomeRequested: ReadonlyMap<string, string>;
  fieldMovements: Array<{ date: Date; status: string; requestNumber?: string | null }>;
  /** Date keys with a clock-in or clock-out (after corrections). */
  attendanceScanKeys: ReadonlySet<string>;
}

const APPROVED = new Set(['APPROVED']);
/** Open requests that will cover the day once approved. */
const REQUESTED = new Set(['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RETURNED', 'PENDING']);

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function inRange(key: string, start: Date, end: Date): boolean {
  return key >= dateKey(start) && key <= dateKey(end);
}

function stateOf(status: string): CoverState | null {
  if (APPROVED.has(status)) {
    return 'APPROVED';
  }
  if (REQUESTED.has(status)) {
    return 'REQUESTED';
  }
  return null;
}

/** Approved beats requested when one day has both. */
function better(a: DayCover | null, b: DayCover | null): DayCover | null {
  if (!a) return b;
  if (!b) return a;
  return a.state === 'APPROVED' || b.state !== 'APPROVED' ? a : b;
}

/**
 * Covers for each day from the modules in `check`. Schedule day-offs (and
 * legacy Sundays) are skipped - no module credits a day off. One cover per
 * day: the first approved one, else the first requested one, in order of
 * `check`.
 */
export function resolveDayCovers(
  days: ReadonlyArray<CoverCheckDay>,
  check: ReadonlyArray<CoverModule>,
  sources: CoverSources,
): DayCover[] {
  const result: DayCover[] = [];
  for (const day of days) {
    const isOff = day.isDayOff ?? day.date.getUTCDay() === 0;
    if (isOff) {
      continue;
    }
    const key = dateKey(day.date);
    let found: DayCover | null = null;
    for (const module of check) {
      let cover: DayCover | null = null;
      switch (module) {
        case 'LEAVE':
          for (const leave of sources.leaves) {
            const state = stateOf(leave.status);
            if (state && leave.periods.some((p) => inRange(key, p.startDate, p.endDate))) {
              cover = better(cover, { date: key, module, state, reference: leave.requestNumber });
            }
          }
          break;
        case 'SITE_ASSIGNMENT':
          for (const site of sources.siteAssignments) {
            const state = stateOf(site.status);
            if (state && inRange(key, site.startDate, site.endDate)) {
              cover = better(cover, { date: key, module, state, reference: site.requestNumber });
            }
          }
          break;
        case 'WORK_FROM_HOME':
          if (sources.workFromHomeApproved.has(key)) {
            cover = { date: key, module, state: 'APPROVED' };
          } else if (sources.workFromHomeRequested.has(key)) {
            cover = {
              date: key,
              module,
              state: 'REQUESTED',
              reference: sources.workFromHomeRequested.get(key),
            };
          }
          break;
        case 'FIELD_MOVEMENT':
          for (const entry of sources.fieldMovements) {
            const state = stateOf(entry.status);
            if (state && dateKey(entry.date) === key) {
              cover = better(cover, { date: key, module, state, reference: entry.requestNumber });
            }
          }
          break;
        case 'ATTENDANCE':
          if (!day.halfDay && sources.attendanceScanKeys.has(key)) {
            cover = { date: key, module, state: 'APPROVED' };
          }
          break;
      }
      found = better(found, cover);
      if (found?.state === 'APPROVED') {
        break;
      }
    }
    if (found) {
      result.push(found);
    }
  }
  return result;
}

const APPROVED_PHRASE: Record<CoverModule, string> = {
  LEAVE: 'has approved leave',
  SITE_ASSIGNMENT: 'has an approved site assignment',
  WORK_FROM_HOME: 'has approved work from home',
  FIELD_MOVEMENT: 'has an approved field movement',
  ATTENDANCE: 'already has attendance recorded',
};

const REQUESTED_PHRASE: Record<CoverModule, string> = {
  LEAVE: 'Leave has been requested for',
  SITE_ASSIGNMENT: 'A site assignment has been requested for',
  WORK_FROM_HOME: 'Work from home has been requested for',
  FIELD_MOVEMENT: 'A field movement has been requested for',
  ATTENDANCE: 'Attendance has been recorded for',
};

/**
 * "This day (2026-08-03) has approved leave (LV-0012)." /
 * "Leave has been requested for this day (2026-08-03) - LV-0012."
 */
export function dayCoverMessage(cover: DayCover): string {
  const ref = cover.reference ? ` (${cover.reference})` : '';
  if (cover.state === 'APPROVED') {
    return `This day (${cover.date}) ${APPROVED_PHRASE[cover.module]}${ref}.`;
  }
  return `${REQUESTED_PHRASE[cover.module]} this day (${cover.date})${ref}.`;
}

/** Every calendar day from start to end (UTC, inclusive). */
export function eachDay(start: Date, end: Date): CoverCheckDay[] {
  const days: CoverCheckDay[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cursor.getTime() <= last) {
    days.push({ date: new Date(cursor.getTime()) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
