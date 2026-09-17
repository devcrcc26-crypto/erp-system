'use client';

import type { Dayjs } from 'dayjs';
import type {
  FlightTicketClass,
  FlightTripType,
  FlightVisaStatus,
} from '@/lib/api/business-trip.types';

export interface BusinessTripDetailsValues {
  tripType: FlightTripType;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  departureDate: Dayjs | null;
  returnDate: Dayjs | null;
  ticketClass: FlightTicketClass;
}

export interface BusinessTripPurposeBudgetValues {
  purpose: string;
  hostOrganization: string;
  hostContact: string;
  expectedOutcomes: string;
  itinerary: string;
  estimatedFlightCost?: number | null;
  estimatedAccommodationCost?: number | null;
  estimatedPerDiem?: number | null;
  estimatedOtherCost?: number | null;
}

export interface BusinessTripPassengerValues {
  employeeId: string;
  name: string;
  passportNumber?: string;
  visaRequired: boolean;
  visaStatus?: FlightVisaStatus;
}

export interface BusinessTripAdditionalValues {
  accommodationRequired: boolean;
  accommodationDetails: string;
  perDiemRequired: boolean;
  notes: string;
  files: File[];
}
