/**
 * Years of experience are computed from the earliest PriorEmployment.dateFrom
 * and User.employmentDate. The stored User.yearsOfExperience /
 * yearsOfExperienceAsOf columns are deprecated and no longer written by
 * create/update user APIs.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Today as a date-only value (UTC midnight). */
export function todayDateOnly(today: Date = new Date()): Date {
  return new Date(utcDay(today));
}

/**
 * Career years from the earliest known start date (prior employment dateFrom
 * and/or company employmentDate), rounded to one decimal. Null when no dates.
 */
export function calculateYearsOfExperienceFromDates(
  employmentDate: Date | null | undefined,
  priorDateFroms: ReadonlyArray<Date | null | undefined>,
  today: Date = new Date(),
): number | null {
  const dates: Date[] = [];
  if (employmentDate) {
    dates.push(employmentDate);
  }
  for (const dateFrom of priorDateFroms) {
    if (dateFrom) {
      dates.push(dateFrom);
    }
  }
  if (dates.length === 0) {
    return null;
  }
  let earliest = dates[0]!;
  for (let i = 1; i < dates.length; i += 1) {
    const candidate = dates[i]!;
    if (utcDay(candidate) < utcDay(earliest)) {
      earliest = candidate;
    }
  }
  const elapsedDays = Math.max(0, (utcDay(today) - utcDay(earliest)) / DAY_MS);
  return roundToTenth(elapsedDays / DAYS_PER_YEAR);
}

/**
 * @deprecated Stored as-of years are no longer used for API responses.
 * Prefer calculateYearsOfExperienceFromDates.
 */
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

/**
 * @deprecated Create/UpdateUserDto no longer accept yearsOfExperience.
 * Kept for legacy import / provisioning paths that still write the column.
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
