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
  fileType?: string | null;
  fileSizeBytes?: number | null;
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
  ticket?: FlightDocumentSummary;
}

export interface FlightApprovalTier {
  id: string;
  tierOrder: number;
  label: string;
  approverId: string;
  resolver: string;
  decision: string;
  comment?: string | null;
  conditions?: unknown;
  decidedAt?: string | null;
  approver?: FlightUserSummary;
}

export interface FlightApprovalSummary {
  id: string;
  status: string;
  currentTier?: number;
  tiers: FlightApprovalTier[];
}

export interface FlightApplicationListItem {
  id: string;
  applicationNumber: string;
  submittedBy: string;
  tripType: FlightTripType;
  isInternational: boolean;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string | null;
  status: FlightApplicationStatus;
  passengerCount: number;
  currentTierLabel?: string | null;
  needsTicketAttachment?: boolean;
  submitter?: FlightUserSummary;
  approvalRequestId?: string | null;
  createdAt: string;
}

export interface FlightApplicationDetail extends FlightApplicationListItem {
  purpose: string;
  ticketClass: FlightTicketClass;
  accommodationRequired: boolean;
  accommodationDetails?: string | null;
  perDiemRequired: boolean;
  notes?: string | null;
  combinedTicketDocumentId?: string | null;
  combinedTicket?: FlightDocumentSummary;
  passengers: FlightPassenger[];
  documents: FlightDocumentSummary[];
  approvalRequest?: FlightApprovalSummary | null;
}

export interface SubmitFlightApplicationPayload {
  tripType: FlightTripType;
  isInternational: boolean;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  purpose: string;
  ticketClass: FlightTicketClass;
  accommodationRequired: boolean;
  accommodationDetails?: string;
  perDiemRequired: boolean;
  notes?: string;
  passengers: Array<{
    employeeId: string;
    passportNumber?: string;
    visaRequired?: boolean;
    visaStatus?: FlightVisaStatus;
  }>;
  files?: File[];
}

export interface ListFlightApplicationsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: FlightApplicationStatus | FlightApplicationStatus[];
  isInternational?: boolean;
  submittedById?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: string;
}
