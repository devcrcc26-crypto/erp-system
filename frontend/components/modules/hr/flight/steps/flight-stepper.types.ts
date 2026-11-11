'use client';

import type { Dayjs } from 'dayjs';
import type {
  FlightTicketClass,
  FlightTripType,
  FlightVisaStatus,
} from '@/lib/api/flight.types';

export interface FlightTripDetailsValues {
  tripType: FlightTripType;
  isInternational: boolean;
  originCountry: string;
  originCity: string;
  destination: string;
  /** City portion when international; mirrors destination for domestic. */
  destinationCity?: string;
  destinationCountry?: string;
  departureDate: Dayjs | null;
  returnDate: Dayjs | null;
  purpose: string;
  ticketClass: FlightTicketClass;
}

export interface FlightPassengerValues {
  employeeId: string;
  name: string;
  passportNumber?: string;
  visaRequired: boolean;
  visaStatus?: FlightVisaStatus;
}

export interface FlightAdditionalValues {
  notes: string;
  linkedBusinessTripId?: string;
  siteAssignmentId?: string;
  files: File[];
}
