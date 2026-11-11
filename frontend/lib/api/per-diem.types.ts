import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
export type SupportedCurrency = 'ETB' | 'USD' | 'CNY';

export type PerDiemTripType = 'TRAVEL' | 'SITE_DEPLOYMENT';

export type PerDiemBalanceDirection = 'TO_COMPANY' | 'TO_EMPLOYEE' | 'NONE';

export type PerDiemStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'ACTIVE'
  | 'SETTLED';

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
  domesticRate?: number | string | null;
  regionalRate?: number | string | null;
  internationalRate?: number | string | null;
  domesticActive: boolean;
  regionalActive: boolean;
  internationalActive: boolean;
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
  domesticRate?: number | null;
  regionalRate?: number | null;
  internationalRate?: number | null;
  domesticActive?: boolean;
  regionalActive?: boolean;
  internationalActive?: boolean;
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
  createdBy?: string;
  destinationCategory: string;
  destination: string;
  tripType?: PerDiemTripType;
  startDate: string;
  endDate: string;
  departureTime?: string | null;
  returnTime?: string | null;
  days: number;
  totalDays?: number | null;
  dailyRate: number | string;
  currency: SupportedCurrency;
  totalAmount: number | string;
  totalAmountEtb: number | string;
  status: PerDiemStatus;
  pvNumber?: string | null;
  pvDate?: string | null;
  disbursementCount?: number;
  siteAssignmentId?: string | null;
  settlementId?: string | null;
  settlement?: {
    id: string;
    requestNumber: string;
    status?: PerDiemStatus;
  } | null;
  approvalRequestId?: string | null;
  employee?: PerDiemUserSummary;
  createdAt: string;
  submittedAt?: string | null;
  completedAt?: string | null;
}

export interface PerDiemRequestDetail extends PerDiemRequestListItem {
  /** True when the caller may record a cash disbursement for this request. */
  canDisburse?: boolean;
  notes?: string | null;
  requestedDailyRate?: string | null;
  rateOverrideReason?: string | null;
  approvedDailyRate?: string | null;
  actualStartDate?: string | null;
  employeePerDiemRate?: EmployeePerDiemRate | null;
  disbursements?: PerDiemDisbursement[];
  requestSettlement?: PerDiemRequestSettlement | null;
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
  siteAssignment?: {
    id: string;
    requestNumber: string;
    siteName: string;
    startDate: string;
    endDate: string;
    status: string;
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

export interface SubmitPerDiemRequestPayload extends OnBehalfPayload {
  tripType: PerDiemTripType;
  destinationCategory: string;
  destination: string;
  startDate: string;
  endDate: string;
  departureTime?: string;
  returnTime?: string;
  days: number;
  linkedFlightId?: string;
  linkedBusinessTripId?: string;
  siteAssignmentId?: string;
  notes?: string;
  requestedDailyRate?: number;
  rateOverrideReason?: string;
}

/** PATCH body when the employee edits a DRAFT / RETURNED request. */
export type UpdatePerDiemRequestPayload = Omit<
  SubmitPerDiemRequestPayload,
  keyof OnBehalfPayload
>;

export interface PerDiemDisbursementAttachment {
  id: string;
  disbursementId: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedAt: string;
}

export interface PerDiemDisbursement {
  id: string;
  requestId: string;
  amount: number | string;
  disbursedAt: string;
  coveredDaysFrom: string;
  coveredDaysTo: string;
  disbursedById: string;
  disbursedBy?: PerDiemUserSummary | null;
  notes?: string | null;
  createdAt: string;
  attachments?: PerDiemDisbursementAttachment[];
}

export interface PerDiemRequestSettlement {
  id: string;
  requestId: string;
  actualReturnDate: string;
  actualDays: number;
  earnedTotal: number | string;
  totalDisbursed: number | string;
  balance: number | string;
  settledById: string;
  settledBy?: PerDiemUserSummary | null;
  settledAt: string;
  notes?: string | null;
  balancePaymentReference?: string | null;
  balancePaymentDate?: string | null;
  balancePaidAt?: string | null;
  balancePaidBy?: PerDiemUserSummary | null;
}

export interface FormalizeRequestSettlementBalancePayload {
  paymentReference: string;
  paymentDate: string;
}

export interface CreateDisbursementPayload {
  disbursedAt: string;
  coveredDaysFrom: string;
  coveredDaysTo: string;
  notes?: string;
}

export interface CreateRequestSettlementPayload {
  actualReturnDate: string;
  actualDaysOverride?: number;
  notes?: string;
}

export interface PerDiemAdvanceSummary {
  id: string;
  requestNumber: string;
  pvNumber?: string | null;
  pvDate?: string | null;
  destination: string;
  destinationCategory: string;
  startDate: string;
  endDate: string;
  days: number;
  totalAmount: number | string;
  totalAmountEtb: number | string;
  currency: SupportedCurrency;
  status: PerDiemStatus;
  _count?: { disbursements: number };
}

export type PerDiemSettlementKind = 'BATCH' | 'REQUEST';

export interface PerDiemSettlementListItem {
  id: string;
  companyId: string;
  requestNumber: string;
  employeeId: string;
  destination: string;
  destinationCategory: string;
  actualDepartureDate?: string;
  actualReturnDate: string;
  actualDays: number;
  dailyRate?: number | string;
  perDiemEarned: number | string;
  totalAdvances: number | string;
  balance: number | string;
  balanceDirection: PerDiemBalanceDirection;
  status: PerDiemStatus;
  employee?: PerDiemUserSummary;
  createdAt: string;
  settlementKind?: PerDiemSettlementKind;
  requestId?: string;
  balancePaidAt?: string | null;
}

export interface PerDiemSettlementDetail extends PerDiemSettlementListItem {
  actualDepartureTime: string;
  actualReturnTime: string;
  vehicleUsed: boolean;
  kmDeparture?: number | null;
  kmReturn?: number | null;
  cashReturnedReceiptNo?: string | null;
  cashReturnedDate?: string | null;
  notes?: string | null;
  approvalRequestId?: string | null;
  advances: PerDiemAdvanceSummary[];
  approvalRequest?: PerDiemRequestDetail['approvalRequest'];
}

export interface SubmitPerDiemSettlementPayload {
  destination: string;
  actualDepartureDate: string;
  actualDepartureTime: string;
  actualReturnDate: string;
  actualReturnTime: string;
  actualDays: number;
  advanceIds: string[];
  vehicleUsed?: boolean;
  kmDeparture?: number;
  kmReturn?: number;
  notes?: string;
}

export interface RecordCashReturnedPayload {
  cashReturnedReceiptNo: string;
  cashReturnedDate: string;
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
