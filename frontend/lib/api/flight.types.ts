import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
export type FlightTripType = 'ONE_WAY' | 'ROUND_TRIP';
export type FlightTicketClass = 'ECONOMY' | 'BUSINESS';
export type FlightVisaStatus = 'NOT_APPLIED' | 'APPLIED' | 'APPROVED';
export type FlightApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';
export type FlightAcknowledgementStatus = 'PENDING' | 'ACKNOWLEDGED';

export interface FlightUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface FlightDocumentSummary {
  id: string;
  name: string;
  fileType?: string;
  fileSizeBytes?: number;
}

export interface FlightSelectablePassenger {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  position: string | null;
}

export interface FlightPassenger {
  id: string;
  employeeId: string;
  passportNumber?: string | null;
  visaRequired: boolean;
  visaStatus?: FlightVisaStatus | null;
  ticketDocumentId?: string | null;
  acknowledgementStatus: FlightAcknowledgementStatus;
  acknowledgedAt?: string | null;
  employee?: FlightUserSummary;
  ticket?: FlightDocumentSummary | null;
  tickets?: FlightDocumentSummary[];
}

export interface FlightApplicationListItem {
  id: string;
  applicationNumber: string;
  submittedBy: string;
  tripType: FlightTripType;
  isInternational: boolean;
  originCountry: string;
  originCity: string;
  destination: string;
  departureDate: string;
  returnDate?: string | null;
  status: FlightApplicationStatus;
  passengerCount: number;
  currentTierLabel?: string | null;
  currentStepLabel?: string | null;
  needsTicketAttachment?: boolean;
  combinedTicketDocumentId?: string | null;
  submitter?: FlightUserSummary;
  approvalRequestId?: string | null;
  createdAt: string;
}

export interface FlightApplicationDetail extends FlightApplicationListItem {
  purpose: string;
  ticketClass: FlightTicketClass;
  notes?: string | null;
  linkedBusinessTripId?: string | null;
  linkedBusinessTripNumber?: string | null;
  siteAssignmentId?: string | null;
  siteAssignmentReference?: string | null;
  combinedTicket?: FlightDocumentSummary | null;
  combinedTickets?: FlightDocumentSummary[];
  passengers: FlightPassenger[];
  documents: FlightDocumentSummary[];
  approvalRequest?: {
    id: string;
    status: string;
    currentTier: number;
    tiers: Array<{
      id: string;
      tierOrder: number;
      label: string;
      decision: string;
      approver?: FlightUserSummary;
      comment?: string | null;
      decidedAt?: string | null;
    }>;
  } | null;
}

export interface SubmitFlightPassengerPayload {
  employeeId: string;
  passportNumber?: string;
  visaRequired?: boolean;
  visaStatus?: FlightVisaStatus;
}

export interface SubmitFlightApplicationPayload extends OnBehalfPayload {
  tripType: FlightTripType;
  isInternational: boolean;
  originCountry: string;
  originCity: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  purpose: string;
  ticketClass: FlightTicketClass;
  notes?: string;
  linkedBusinessTripId?: string;
  siteAssignmentId?: string;
  passengers: SubmitFlightPassengerPayload[];
  files?: File[];
}

/** PATCH body when the employee edits a DRAFT / RETURNED application (JSON, no files). */
export type UpdateFlightApplicationPayload = Omit<
  SubmitFlightApplicationPayload,
  keyof OnBehalfPayload | 'files'
>;

export interface ListFlightApplicationsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: FlightApplicationStatus | FlightApplicationStatus[];
  isInternational?: boolean;
  needsTicket?: boolean;
  submittedById?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
