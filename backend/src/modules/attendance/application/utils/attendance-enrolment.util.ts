/**
 * "Needs enrolment": an employee missing from the attendance export because
 * they are not yet enrolled on the attendance machine. HR's choice creates a
 * counted-present record (like "Present this month") and keeps the employee on
 * the "Awaiting enrolment" list until an import contains a scan for them.
 */

export const NOT_ENROLLED_RECORD_NOTE =
  'Not yet enrolled on the attendance machine';

export const NOT_ENROLLED_PAYROLL_NOTE =
  'Not enrolled on the attendance machine - counted present.';

/** Match methods whose month has no scans and is counted present by decision. */
const COUNTED_PRESENT_MATCH_METHODS = new Set([
  'MANUAL_PRESENT',
  'EXEMPT',
  'NEEDS_ENROLMENT',
]);

export function isCountedPresentMatchMethod(
  matchMethod: string | null | undefined,
): boolean {
  return matchMethod != null && COUNTED_PRESENT_MATCH_METHODS.has(matchMethod);
}

function monthIndex(month: number, year: number): number {
  return year * 12 + (month - 1);
}

/**
 * Consecutive months immediately before (month, year) that already had a
 * Needs-enrolment record. 0 = first month missing; 1 = this is the 2nd month.
 */
export function previousNotEnrolledMonths(
  month: number,
  year: number,
  enrolmentMonths: ReadonlyArray<{ month: number; year: number }>,
): number {
  const set = new Set(enrolmentMonths.map((m) => monthIndex(m.month, m.year)));
  let count = 0;
  let cursor = monthIndex(month, year) - 1;
  while (set.has(cursor)) {
    count += 1;
    cursor -= 1;
  }
  return count;
}

export interface EnrolmentRecordInput {
  employeeId: string;
  month: number;
  year: number;
  matchMethod: string;
  /** At least one clock-in or clock-out in the month (a real scan). */
  hasScan: boolean;
}

export interface AwaitingEnrolmentEntry {
  employeeId: string;
  /** Needs-enrolment months since the employee's last scanned month. */
  months: number;
  since: { month: number; year: number };
  latest: { month: number; year: number };
}

/**
 * Employees still awaiting enrolment: a Needs-enrolment record with no later
 * month that contains a scan. Derived from current records only, so an
 * overwrite or re-import that brings scans removes the employee automatically.
 */
export function awaitingEnrolment(
  records: ReadonlyArray<EnrolmentRecordInput>,
): AwaitingEnrolmentEntry[] {
  const byEmployee = new Map<string, EnrolmentRecordInput[]>();
  for (const record of records) {
    const list = byEmployee.get(record.employeeId) ?? [];
    list.push(record);
    byEmployee.set(record.employeeId, list);
  }

  const result: AwaitingEnrolmentEntry[] = [];
  for (const [employeeId, list] of byEmployee) {
    const lastScan = Math.max(
      -1,
      ...list
        .filter((r) => r.hasScan && r.matchMethod !== 'NEEDS_ENROLMENT')
        .map((r) => monthIndex(r.month, r.year)),
    );
    const pending = list
      .filter(
        (r) =>
          r.matchMethod === 'NEEDS_ENROLMENT' &&
          monthIndex(r.month, r.year) > lastScan,
      )
      .sort((a, b) => monthIndex(a.month, a.year) - monthIndex(b.month, b.year));
    if (pending.length === 0) {
      continue;
    }
    const first = pending[0];
    const last = pending[pending.length - 1];
    result.push({
      employeeId,
      months: pending.length,
      since: { month: first.month, year: first.year },
      latest: { month: last.month, year: last.year },
    });
  }
  return result;
}
