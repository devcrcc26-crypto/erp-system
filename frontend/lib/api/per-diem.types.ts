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

export interface EmployeePerDiemRate {
  id: string;
  companyId: string;
  employeeId: string;
  americasRate?: number | string | null;
  asiaRate?: number | string | null;
  domesticRate?: number | string | null;
  eastAfricaRate?: number | string | null;
  europeRate?: number | string | null;
  middleEastRate?: number | string | null;
  otherAfricaRate?: number | string | null;
  americasActive: boolean;
  asiaActive: boolean;
  domesticActive: boolean;
  eastAfricaActive: boolean;
  europeActive: boolean;
  middleEastActive: boolean;
  otherAfricaActive: boolean;
  currency: SupportedCurrency;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeePerDiemActiveCategory {
  destinationCategory: string;
  dailyRate: number;
  currency: SupportedCurrency;
  isActive: boolean;
}

export interface UpsertEmployeePerDiemRatePayload {
  americasRate?: number | null;
  asiaRate?: number | null;
  domesticRate?: number | null;
  eastAfricaRate?: number | null;
  europeRate?: number | null;
  middleEastRate?: number | null;
  otherAfricaRate?: number | null;
  americasActive?: boolean;
  asiaActive?: boolean;
  domesticActive?: boolean;
  eastAfricaActive?: boolean;
  europeActive?: boolean;
  middleEastActive?: boolean;
  otherAfricaActive?: boolean;
  currency?: SupportedCurrency;
}

export interface EmployeePerDiemRateListEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  department?: { id: string; name: string } | null;
}

export interface EmployeePerDiemRateListItem {
  employeeId: string;
  employee: EmployeePerDiemRateListEmployee;
  rate: EmployeePerDiemRate | null;
}

export interface ListEmployeePerDiemRatesParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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
  totalDays?: number | null;
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
  employeePerDiemRate?: EmployeePerDiemRate | null;
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
