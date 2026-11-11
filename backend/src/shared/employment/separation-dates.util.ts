/** Company local timezone is Africa/Addis_Ababa: UTC+3, no daylight saving. */
const ADDIS_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Today's Addis Ababa calendar date as a UTC-midnight Date (matches @db.Date columns). */
export function todayInAddisUtc(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + ADDIS_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}

/** The leaving date is the last working day, so separation takes effect the day after. */
export function separationIsEffective(leavingDate: Date, today: Date): boolean {
  return leavingDate.getTime() < today.getTime();
}

export function parseDateOnlyUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function minDate(a: Date | null, b: Date): Date {
  return a && a.getTime() < b.getTime() ? a : b;
}
