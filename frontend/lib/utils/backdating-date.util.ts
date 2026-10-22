/** EAT (Africa/Nairobi, UTC+3) — aligned with backend earliest-allowed-date.util. */
const OPERATING_TIME_ZONE = 'Africa/Nairobi';

function operatingMonthStartMs(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATING_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return Date.UTC(year, month - 1, 1);
}

/** True when `dateYmd` is before the first day of the current month in EAT. */
export function isBeforeCurrentMonthEat(
  dateYmd: string,
  now: Date = new Date(),
): boolean {
  const [yearStr, monthStr, dayStr] = dateYmd.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }
  const dateMs = Date.UTC(year, month - 1, day);
  return dateMs < operatingMonthStartMs(now);
}

/** @deprecated Use isBeforeCurrentMonthEat */
export const isBeforeCurrentMonthUtc = isBeforeCurrentMonthEat;
