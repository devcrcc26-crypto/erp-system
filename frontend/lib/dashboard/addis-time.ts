/**
 * Ethiopian local time (East Africa Time, UTC+3, no daylight saving) for the
 * dashboard greeting and "this month" widgets, independent of the browser's
 * own time zone.
 */
export const ADDIS_TIME_ZONE = 'Africa/Addis_Ababa';

const ADDIS_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface AddisParts {
  /** 0–23 */
  readonly hour: number;
  /** 1–12 */
  readonly month: number;
  readonly year: number;
}

export function addisParts(now: Date = new Date()): AddisParts {
  const shifted = new Date(now.getTime() + ADDIS_OFFSET_MS);
  return {
    hour: shifted.getUTCHours(),
    month: shifted.getUTCMonth() + 1,
    year: shifted.getUTCFullYear(),
  };
}

export type GreetingPeriod = 'morning' | 'afternoon' | 'evening';

export function greetingPeriod(hour: number): GreetingPeriod {
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 17) {
    return 'afternoon';
  }
  return 'evening';
}

/** e.g. "Thursday, 1 October 2026" / "2026年10月1日星期四", in Addis Ababa time. */
export function formatAddisDate(now: Date, locale: string): string {
  return now.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-GB', {
    timeZone: ADDIS_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Whole days from `now` until `date` (negative when past), by Addis calendar day. */
export function daysUntil(date: string | Date, now: Date = new Date()): number {
  const day = (value: Date): number =>
    Math.floor((value.getTime() + ADDIS_OFFSET_MS) / 86_400_000);
  return day(new Date(date)) - day(now);
}
