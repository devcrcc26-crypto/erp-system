import { BadRequestException } from '@nestjs/common';
import { FlightTripType } from '@prisma/client';
import { describe, expect, it } from '@jest/globals';
import { assertRoundTripTravelDates } from './travel-trip-dates.util';

describe('assertRoundTripTravelDates', () => {
  const d = (iso: string): Date => new Date(iso);

  it('allows one-way without return', () => {
    expect(() =>
      assertRoundTripTravelDates(
        FlightTripType.ONE_WAY,
        d('2026-09-01T08:00:00.000Z'),
        null,
      ),
    ).not.toThrow();
  });

  it('requires at least 90 minutes between departure and return', () => {
    expect(() =>
      assertRoundTripTravelDates(
        FlightTripType.ROUND_TRIP,
        d('2026-09-01T08:00:00.000Z'),
        d('2026-09-01T09:00:00.000Z'),
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts exactly 90 minutes apart', () => {
    expect(() =>
      assertRoundTripTravelDates(
        FlightTripType.ROUND_TRIP,
        d('2026-09-01T08:00:00.000Z'),
        d('2026-09-01T09:30:00.000Z'),
      ),
    ).not.toThrow();
  });
});
