import type { Dayjs } from 'dayjs';

/** Minimum gap between round-trip departure and return (1 hour 30 minutes). */
export const MIN_ROUND_TRIP_MINUTES = 90;

/**
 * True when return is at least {@link MIN_ROUND_TRIP_MINUTES} after departure.
 */
export function isRoundTripDurationValid(
  departure: Dayjs | null,
  returnDate: Dayjs | null,
): boolean {
  if (!departure || !returnDate) {
    return true;
  }
  return returnDate.diff(departure, 'minute', true) >= MIN_ROUND_TRIP_MINUTES;
}
