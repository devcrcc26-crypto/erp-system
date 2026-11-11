import dayjs, { type Dayjs } from 'dayjs';

/**
 * Date picker constraints shared by HR request forms.
 * "Today" is the user's local calendar day (company users are in Addis Ababa);
 * the backend re-validates against Africa/Addis_Ababa.
 */

/** Blocks days after today. */
export function disableFutureDates(current: Dayjs | null): boolean {
  return Boolean(current && current.isAfter(dayjs().endOf('day')));
}

/** Blocks days before today. */
export function disablePastDates(current: Dayjs | null): boolean {
  return Boolean(current && current.isBefore(dayjs().startOf('day')));
}

/** Allows only today. */
export function disableAllButToday(current: Dayjs | null): boolean {
  return Boolean(current && !current.isSame(dayjs(), 'day'));
}

/**
 * Departure pickers: HR / full access may backdate; everyone else is limited to
 * today or later.
 */
export function getDisabledDepartureDate(
  isHrOrFullAccess: boolean,
): (current: Dayjs | null) => boolean {
  return (current) => (isHrOrFullAccess ? false : disablePastDates(current));
}

/** Return pickers: no day before the departure day. */
export function getDisabledReturnDate(
  departure: Dayjs | null | undefined,
): (current: Dayjs | null) => boolean {
  return (current) =>
    Boolean(
      current && departure && current.isBefore(departure.startOf('day')),
    );
}

/** Blocks months after the current month (month pickers). */
export function disableFutureMonths(current: Dayjs | null): boolean {
  return Boolean(current && current.isAfter(dayjs().endOf('month')));
}
