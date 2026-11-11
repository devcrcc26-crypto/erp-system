import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
export type LeaveType =
  | 'ANNUAL'
  | 'SICK'
  | 'UNPAID'
  | 'MATERNITY'
  | 'PATERNITY'
  | 'EMERGENCY'
  | 'COMPASSIONATE'
  | 'STUDY'
  | 'EXAM';

export type LeaveRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export interface LeaveUserSummary {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string | null;
  chineseName?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
}

export interface LeaveApprovalTier {
  id: string;
  tierOrder: number;
  label: string;
  approverId: string;
  resolver: string;
  decision: string;
  comment?: string | null;
  conditions?: unknown;
  decidedAt?: string | null;
  approver?: LeaveUserSummary;
}

export interface LeaveApprovalSummary {
  id: string;
  status: string;
  currentTier?: number;
  category?: { id: string; code: string; name: string; icon?: string | null };
  tiers?: LeaveApprovalTier[];
}

export interface LeavePeriod {
  id?: string;
  startDate: string;
  endDate: string;
  days: number;
  dayPortion?: 'FULL' | 'MORNING' | 'AFTERNOON';
}

export interface LeaveDayBreakdown {
  date: string;
  type: 'working' | 'half' | 'weekend' | 'holiday';
  holidayName?: string;
  weight: number;
}

export interface LeaveRequestListItem {
  id: string;
  companyId: string;
  requestNumber: string;
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string | null;
  status: LeaveRequestStatus;
  approvalRequestId?: string | null;
  submittedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: LeaveUserSummary;
  approvalRequest?: Pick<
    LeaveApprovalSummary,
    'id' | 'status' | 'currentTier'
  > | null;
  periods?: LeavePeriod[];
}

export interface LeaveRequestDetail extends LeaveRequestListItem {
  creator?: LeaveUserSummary;
  approvalRequest?: LeaveApprovalSummary | null;
  /** Balance for this leave type / year when loaded from detail. */
  balance?: LeaveBalance | null;
  documents?: LeaveAttachmentDocument[];
  breakdown?: LeaveDayBreakdown[];
}

export interface LeaveAttachmentDocument {
  id: string;
  name: string;
  fileType?: string;
  fileSizeBytes?: number;
  createdAt?: string;
}

export interface LeaveBalance {
  id: string;
  companyId?: string;
  employeeId: string;
  year: number;
  leaveType: LeaveType;
  leaveYearStart?: string;
  leaveYearEnd?: string;
  entitled: number;
  broughtForward: number;
  used: number;
  pending: number;
  remaining: number;
}

/** Contract leave year option for the profile year dropdown. */
export interface LeaveYearOption {
  label: number;
  start: string;
  end: string;
}

export interface LeaveYearsResponse {
  current: LeaveYearOption;
  years: LeaveYearOption[];
}

export interface EmployeeLeaveBalanceSummary {
  employeeId: string;
  employee: LeaveUserSummary;
  year: number;
  annual: LeaveBalance | null;
  maternity: LeaveBalance | null;
  sick: LeaveBalance | null;
}

export interface ListLeaveBalancesParams {
  page?: number;
  limit?: number;
  year?: number;
  employeeId?: string;
  search?: string;
}

export interface ListLeaveRequestsParams {
  page?: number;
  limit?: number;
  status?: LeaveRequestStatus | LeaveRequestStatus[];
  leaveType?: LeaveType;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface SubmitLeaveRequestPayload extends OnBehalfPayload {
  leaveType: LeaveType;
  periods?: Array<{
    startDate: string;
    endDate: string;
    dayPortion?: 'FULL' | 'MORNING' | 'AFTERNOON';
  }>;
  startDate?: string;
  endDate?: string;
  days?: number;
  reason?: string;
  files?: File[];
}

export interface UpdateLeaveRequestPayload {
  leaveType?: LeaveType;
  periods?: Array<{
    startDate: string;
    endDate: string;
    dayPortion?: 'FULL' | 'MORNING' | 'AFTERNOON';
  }>;
  startDate?: string;
  endDate?: string;
  days?: number;
  reason?: string;
}

export type LeaveBalanceEntryKind =
  | 'ENTITLEMENT'
  | 'CARRY_OVER'
  | 'ADJUSTMENT'
  | 'OPENING_BALANCE'
  | 'USED'
  | 'EXPIRED';

/** Leave year = contract year (contract start + anniversaries); `label` = year it starts in. */
export interface LeaveYearView {
  label: number;
  start: string;
  end: string;
}

export interface LeaveBalanceEntryPeriod {
  startDate: string;
  endDate: string;
}

export interface LeaveBalanceEntry {
  id: string;
  leaveType: LeaveType;
  /** Calendar year the leave year starts in (display-only). */
  leaveYearLabel?: number;
  leaveYearStart: string;
  leaveYearEnd: string;
  kind: LeaveBalanceEntryKind;
  /** Signed days (USED / EXPIRED negative). */
  days: number;
  reason: string | null;
  sourceContractId: string | null;
  sourceLeaveRequestId: string | null;
  /** Leave request date ranges when this entry came from an approved request. */
  requestedPeriods?: LeaveBalanceEntryPeriod[];
  /** Leave requester when linked; otherwise the ledger actor. */
  createdBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface LeaveBalanceLedger {
  currentLeaveYear: LeaveYearView;
  leaveYear: LeaveYearView | null;
  entries: LeaveBalanceEntry[];
  totals: Array<{ leaveType: LeaveType; balance: number }>;
}

export interface LeaveBalanceEntryPayload {
  employeeId: string;
  leaveType: LeaveType;
  days: number;
  reason: string;
}

export interface LeaveBalanceSnapshotRow {
  leaveType: LeaveType;
  entitled: number;
  broughtForward: number;
  used: number;
}

export interface LeaveBalanceSnapshotPayload {
  employeeId: string;
  /** Leave year label; omit for the employee's current leave year. */
  year?: number;
  rows: LeaveBalanceSnapshotRow[];
  reason: string;
}

export interface LeaveBalanceSnapshotResult {
  year: LeaveYearView;
  balances: Array<{
    leaveType: LeaveType;
    entitled: number;
    broughtForward: number;
    used: number;
    pending: number;
    remaining: number;
  }>;
}
