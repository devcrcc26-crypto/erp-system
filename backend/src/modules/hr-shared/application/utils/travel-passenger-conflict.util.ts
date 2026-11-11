import { BadRequestException } from '@nestjs/common';
import {
  BusinessTripStatus,
  FlightApplicationStatus,
  type Prisma,
} from '@prisma/client';

const FLIGHT_BLOCKING_STATUSES: FlightApplicationStatus[] = [
  FlightApplicationStatus.DRAFT,
  FlightApplicationStatus.SUBMITTED,
  FlightApplicationStatus.IN_REVIEW,
  FlightApplicationStatus.APPROVED,
  FlightApplicationStatus.RETURNED,
];

const BUSINESS_TRIP_BLOCKING_STATUSES: BusinessTripStatus[] = [
  BusinessTripStatus.DRAFT,
  BusinessTripStatus.SUBMITTED,
  BusinessTripStatus.IN_REVIEW,
  BusinessTripStatus.APPROVED,
  BusinessTripStatus.RETURNED,
];

type TravelWindow = {
  kind: 'flight' | 'business_trip';
  reference: string;
  departureDate: Date;
  returnDate: Date | null;
};

export type TravelPassengerConflictInput = {
  employeeIds: readonly string[];
  departureDate: Date;
  returnDate: Date | null;
  excludeFlightApplicationId?: string;
  excludeBusinessTripId?: string;
  skipFlightConflicts?: boolean;
  skipBusinessTripConflicts?: boolean;
};

/**
 * End of a travel window (one-way trips end at departure).
 */
export function travelWindowEnd(
  departureDate: Date,
  returnDate: Date | null,
): Date {
  return returnDate ?? departureDate;
}

/**
 * True when two travel windows overlap in time (inclusive).
 */
export function travelWindowsOverlap(
  aDeparture: Date,
  aReturn: Date | null,
  bDeparture: Date,
  bReturn: Date | null,
): boolean {
  const aStart = aDeparture.getTime();
  const aEnd = travelWindowEnd(aDeparture, aReturn).getTime();
  const bStart = bDeparture.getTime();
  const bEnd = travelWindowEnd(bDeparture, bReturn).getTime();
  return aStart <= bEnd && bStart <= aEnd;
}

function formatTravelInstant(value: Date): string {
  return value.toISOString().replace('T', ' ').slice(0, 16);
}

function conflictMessage(
  existing: TravelWindow,
  proposedDeparture: Date,
): string {
  const label =
    existing.kind === 'flight'
      ? `flight application ${existing.reference}`
      : `business trip ${existing.reference}`;
  const sameDeparture =
    existing.departureDate.getTime() === proposedDeparture.getTime();
  if (sameDeparture) {
    return `A passenger already has ${label} with the same departure date and time (${formatTravelInstant(existing.departureDate)})`;
  }
  return `A passenger has an overlapping ${label} (${formatTravelInstant(existing.departureDate)}${existing.returnDate ? ` – ${formatTravelInstant(existing.returnDate)}` : ''})`;
}

/**
 * Blocks duplicate or overlapping flight / business-trip travel for the same passengers.
 */
export async function assertNoTravelPassengerConflicts(
  prisma: Prisma.TransactionClient | Prisma.DefaultPrismaClient,
  companyId: string,
  input: TravelPassengerConflictInput,
): Promise<void> {
  const employeeIds = [...new Set(input.employeeIds.filter(Boolean))];
  if (employeeIds.length === 0) {
    return;
  }

  const [flightPassengers, tripPassengers] = await Promise.all([
    input.skipFlightConflicts
      ? Promise.resolve([])
      : prisma.flightPassenger.findMany({
      where: {
        employeeId: { in: employeeIds },
        application: {
          companyId,
          deletedAt: null,
          status: { in: FLIGHT_BLOCKING_STATUSES },
          ...(input.excludeFlightApplicationId
            ? { id: { not: input.excludeFlightApplicationId } }
            : {}),
        },
      },
      select: {
        employeeId: true,
        application: {
          select: {
            applicationNumber: true,
            departureDate: true,
            returnDate: true,
          },
        },
      },
    }),
    input.skipBusinessTripConflicts
      ? Promise.resolve([])
      : prisma.businessTripPassenger.findMany({
      where: {
        employeeId: { in: employeeIds },
        trip: {
          companyId,
          deletedAt: null,
          status: { in: BUSINESS_TRIP_BLOCKING_STATUSES },
          ...(input.excludeBusinessTripId
            ? { id: { not: input.excludeBusinessTripId } }
            : {}),
        },
      },
      select: {
        employeeId: true,
        trip: {
          select: {
            tripNumber: true,
            departureDate: true,
            returnDate: true,
          },
        },
      },
    }),
  ]);

  const existingByEmployee = new Map<string, TravelWindow[]>();

  for (const row of flightPassengers) {
    const list = existingByEmployee.get(row.employeeId) ?? [];
    list.push({
      kind: 'flight',
      reference: row.application.applicationNumber,
      departureDate: row.application.departureDate,
      returnDate: row.application.returnDate,
    });
    existingByEmployee.set(row.employeeId, list);
  }

  for (const row of tripPassengers) {
    const list = existingByEmployee.get(row.employeeId) ?? [];
    list.push({
      kind: 'business_trip',
      reference: row.trip.tripNumber,
      departureDate: row.trip.departureDate,
      returnDate: row.trip.returnDate,
    });
    existingByEmployee.set(row.employeeId, list);
  }

  for (const employeeId of employeeIds) {
    const existing = existingByEmployee.get(employeeId) ?? [];
    for (const trip of existing) {
      if (
        travelWindowsOverlap(
          input.departureDate,
          input.returnDate,
          trip.departureDate,
          trip.returnDate,
        )
      ) {
        throw new BadRequestException(
          conflictMessage(trip, input.departureDate),
        );
      }
    }
  }
}
