import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
export type FlightTripType = 'ONE_WAY' | 'ROUND_TRIP';
export type FlightTicketClass = 'ECONOMY' | 'BUSINESS';
export type FlightVisaStatus = 'NOT_APPLIED' | 'APPLIED' | 'APPROVED';
export type BusinessTripStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';
export type FlightAcknowledgementStatus = 'PENDING' | 'ACKNOWLEDGED';

export interface BusinessTripUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface BusinessTripDocumentSummary {
  id: string;
  name: string;
  fileType?: string;
  fileSizeBytes?: number;
}

export interface BusinessTripSelectablePassenger {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  position: string | null;
}

export interface BusinessTripPassenger {
  id: string;
  employeeId: string;
  passportNumber?: string | null;
  visaRequired: boolean;
  visaStatus?: FlightVisaStatus | null;
  ticketDocumentId?: string | null;
  acknowledgementStatus: FlightAcknowledgementStatus;
  acknowledgedAt?: string | null;
  employee?: BusinessTripUserSummary;
  ticket?: BusinessTripDocumentSummary | null;
  tickets?: BusinessTripDocumentSummary[];
}

export interface BusinessTripListItem {
  id: string;
  tripNumber: string;
  submittedBy: string;
  tripType: FlightTripType;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  departureDate: string;
  returnDate?: string | null;
  status: BusinessTripStatus;
  passengerCount: number;
  estimatedTotalCost?: number | null;
  currentTierLabel?: string | null;
  currentStepLabel?: string | null;
  needsTicketAttachment?: boolean;
  combinedTicketDocumentId?: string | null;
  submitter?: BusinessTripUserSummary;
  approvalRequestId?: string | null;
  createdAt: string;
}

export interface BusinessTripDetail extends BusinessTripListItem {
  purpose: string;
  hostOrganization?: string | null;
  hostContactName?: string | null;
  hostContactPhone?: string | null;
  hostContactEmail?: string | null;
  expectedOutcomes?: string | null;
  itinerary?: string | null;
  estimatedAccommodationCost?: number | null;
  estimatedPerDiem?: number | null;
  estimatedOtherCost?: number | null;
  estimatedTotalCost?: number | null;
  notes?: string | null;
  combinedTicket?: BusinessTripDocumentSummary | null;
  combinedTickets?: BusinessTripDocumentSummary[];
  passengers: BusinessTripPassenger[];
  documents: BusinessTripDocumentSummary[];
  approvalRequest?: {
    id: string;
    status: string;
    currentTier: number;
    tiers: Array<{
      id: string;
      tierOrder: number;
      label: string;
      decision: string;
      approver?: BusinessTripUserSummary;
      comment?: string | null;
      decidedAt?: string | null;
    }>;
  } | null;
}

export interface SubmitBusinessTripPassengerPayload {
  employeeId: string;
  passportNumber?: string;
  visaRequired?: boolean;
  visaStatus?: FlightVisaStatus;
}

export interface SubmitBusinessTripPayload extends OnBehalfPayload {
  tripType: FlightTripType;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  departureDate: string;
  returnDate?: string;
  purpose: string;
  hostOrganization?: string;
  hostContactName?: string;
  hostContactPhone?: string;
  hostContactEmail?: string;
  expectedOutcomes?: string;
  itinerary?: string;
  estimatedAccommodationCost?: number;
  estimatedPerDiem?: number;
  estimatedOtherCost?: number;
  notes?: string;
  passengers: SubmitBusinessTripPassengerPayload[];
  files?: File[];
}

/** PATCH body when the employee edits a DRAFT / RETURNED trip (JSON, no files). */
export type UpdateBusinessTripPayload = Omit<
  SubmitBusinessTripPayload,
  keyof OnBehalfPayload | 'files'
>;

export interface ListBusinessTripsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: BusinessTripStatus | BusinessTripStatus[];
  needsTicket?: boolean;
  submittedById?: string;
  destinationCountry?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
