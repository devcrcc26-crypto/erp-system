'use client';

import type { Dayjs } from 'dayjs';
import type {
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
}

export interface BusinessTripPurposeBudgetValues {
  purpose: string;
  hostOrganization: string;
  hostContactName: string;
  hostContactPhone: string;
  hostContactEmail: string;
  expectedOutcomes: string;
  itinerary: string;
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
  notes: string;
  files: File[];
}
