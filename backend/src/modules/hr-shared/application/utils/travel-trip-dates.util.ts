import { BadRequestException } from '@nestjs/common';
import { FlightTripType } from '@prisma/client';

/** Minimum gap between round-trip departure and return (1 hour 30 minutes). */
export const MIN_ROUND_TRIP_DURATION_MS = 90 * 60 * 1000;

/**
 * Validates round-trip return date ordering and minimum travel duration.
 */
export function assertRoundTripTravelDates(
  tripType: FlightTripType,
  departureDate: Date,
  returnDate: Date | null,
): void {
  if (tripType !== FlightTripType.ROUND_TRIP) {
    return;
  }
  if (!returnDate) {
    throw new BadRequestException('ROUND_TRIP requires returnDate');
  }
  if (returnDate.getTime() < departureDate.getTime()) {
    throw new BadRequestException(
      'returnDate must be on or after departureDate',
    );
  }
  const durationMs = returnDate.getTime() - departureDate.getTime();
  if (durationMs < MIN_ROUND_TRIP_DURATION_MS) {
    throw new BadRequestException(
      'Return date and time must be at least 1 hour 30 minutes after departure',
    );
  }
}
