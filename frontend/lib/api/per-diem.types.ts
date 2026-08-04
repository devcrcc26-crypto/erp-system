export type SupportedCurrency = 'ETB' | 'USD' | 'CNY';

export type PerDiemStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export interface PerDiemUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface PerDiemRate {
  id: string;
  companyId: string;
  destinationCategory: string;
  dailyRate: number | string;
  currency: SupportedCurrency;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreatePerDiemRatePayload {
  destinationCategory: string;
  dailyRate: number;
  currency: SupportedCurrency;
  description?: string;
}

export interface UpdatePerDiemRatePayload {
  destinationCategory?: string;
  dailyRate?: number;
  currency?: SupportedCurrency;
  description?: string;
  isActive?: boolean;
}

export interface PerDiemRequestListItem {
  id: string;
  companyId: string;
  requestNumber: string;
  employeeId: string;
  destinationCategory: string;
  destination: string;
  startDate: string;
  endDate: string;
  days: number;
  dailyRate: number | string;
  currency: SupportedCurrency;
  totalAmount: number | string;
  totalAmountEtb: number | string;
  status: PerDiemStatus;
  approvalRequestId?: string | null;
  employee?: PerDiemUserSummary;
  createdAt: string;
  submittedAt?: string | null;
  completedAt?: string | null;
}

export interface PerDiemRequestDetail extends PerDiemRequestListItem {
  notes?: string | null;
  perDiemRate?: PerDiemRate | null;
  linkedFlight?: {
    id: string;
    applicationNumber: string;
    destination: string;
  } | null;
  linkedTrip?: {
    id: string;
    tripNumber: string;
    destinationCity: string;
    destinationCountry: string;
  } | null;
  approvalRequest?: {
    id: string;
    status: string;
    currentTier: number;
    tiers: Array<{
      id: string;
      tierOrder: number;
      label: string;
      decision: string;
      approver?: PerDiemUserSummary;
      comment?: string | null;
      decidedAt?: string | null;
    }>;
  } | null;
}

export interface SubmitPerDiemRequestPayload {
  destinationCategory: string;
  destination: string;
  startDate: string;
  endDate: string;
  linkedFlightId?: string;
  linkedBusinessTripId?: string;
  notes?: string;
}

export interface ListPerDiemRequestsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: PerDiemStatus | PerDiemStatus[];
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}
