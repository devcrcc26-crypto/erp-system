/**
 * Years of experience are entered by HR as "N years as of today". We store
 * the number plus the as-of date and show the value grown by the time since.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Current years of experience (one decimal), or null when none recorded. */
export function currentYearsOfExperience(
  years: number | null | undefined,
  asOf: Date | null | undefined,
  today: Date = new Date(),
): number | null {
  if (years == null) {
    return null;
  }
  if (!asOf) {
    return roundToTenth(years);
  }
  const elapsedDays = Math.max(0, (utcDay(today) - utcDay(asOf)) / DAY_MS);
  return roundToTenth(years + elapsedDays / DAYS_PER_YEAR);
}

/** Today as a date-only value (UTC midnight), for the as-of column. */
export function todayDateOnly(today: Date = new Date()): Date {
  return new Date(utcDay(today));
}

/**
 * Update data for a submitted value. Forms show the current value and send it
 * back on every save, so an unchanged value keeps its original as-of date;
 * only a different number restarts the clock. null clears both columns.
 */
export function yearsOfExperienceUpdate(
  submitted: number | null | undefined,
  existing: { yearsOfExperience: number | null; yearsOfExperienceAsOf: Date | null },
  today: Date = new Date(),
): { yearsOfExperience?: number | null; yearsOfExperienceAsOf?: Date | null } {
  if (submitted === undefined) {
    return {};
  }
  if (submitted === null) {
    return existing.yearsOfExperience == null
      ? {}
      : { yearsOfExperience: null, yearsOfExperienceAsOf: null };
  }
  const value = roundToTenth(submitted);
  const current = currentYearsOfExperience(
    existing.yearsOfExperience,
    existing.yearsOfExperienceAsOf,
    today,
  );
  if (current !== null && current === value) {
    return {};
  }
  return { yearsOfExperience: value, yearsOfExperienceAsOf: todayDateOnly(today) };
}
