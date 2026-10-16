export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export function parseUtcDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
}

export function validateSiteAssignmentDateOrder(
  startDate: Date,
  endDate: Date,
): void {
  if (endDate.getTime() < startDate.getTime()) {
    throw new Error('End date must be on or after start date');
  }
}

/** @deprecated Use BackdatingPolicyService - kept as alias for date order only. */
export function validateSiteAssignmentDates(
  startDate: Date,
  endDate: Date,
): void {
  validateSiteAssignmentDateOrder(startDate, endDate);
}

export function calendarDaysInclusive(startDate: Date, endDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return (
    Math.floor(
      (endDate.getTime() - startDate.getTime()) / msPerDay,
    ) + 1
  );
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return (
    a.startDate.getTime() <= b.endDate.getTime() &&
    b.startDate.getTime() <= a.endDate.getTime()
  );
}

/** Calendar months (year, month) touched by an inclusive date range. */
export function monthsTouchedByRange(
  startDate: Date,
  endDate: Date,
): Array<{ month: number; year: number }> {
  const months: Array<{ month: number; year: number }> = [];
  const cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1),
  );
  while (cursor.getTime() <= end.getTime()) {
    months.push({
      month: cursor.getUTCMonth() + 1,
      year: cursor.getUTCFullYear(),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export function siteNameForDate(
  date: Date,
  assignments: ReadonlyArray<{
    startDate: Date;
    endDate: Date;
    siteName: string;
  }>,
): string | null {
  const t = date.getTime();
  for (const row of assignments) {
    if (
      t >= row.startDate.getTime() &&
      t <= row.endDate.getTime()
    ) {
      return row.siteName;
    }
  }
  return null;
}
