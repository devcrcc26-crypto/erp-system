/**
 * UTC calendar-month checks aligned with backend earliest-allowed-date.util.
 */
export function isBeforeCurrentMonthUtc(
  dateYmd: string,
  today: Date = new Date(),
): boolean {
  const [yearStr, monthStr, dayStr] = dateYmd.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }
  const dateMs = Date.UTC(year, month - 1, day);
  const monthStartMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  return dateMs < monthStartMs;
}
