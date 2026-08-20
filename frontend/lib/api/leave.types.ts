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
  lastName: string;
  email: string | null;
  chineseName?: string | null;
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
}

export interface LeaveAttachmentDocument {
  id: string;
  name: string;
  fileType?: string;
  fileSizeBytes?: number;
  createdAt?: string;
}

export interface LeaveRequestDetail extends LeaveRequestListItem {
  creator?: LeaveUserSummary;
  approvalRequest?: LeaveApprovalSummary | null;
  /** Balance for this leave type / year when loaded from detail. */
  balance?: LeaveBalance | null;
  documents?: LeaveAttachmentDocument[];
}

export interface LeaveBalance {
  id: string;
  companyId: string;
  employeeId: string;
  year: number;
  leaveType: LeaveType;
  entitled: number;
  broughtForward: number;
  used: number;
  pending: number;
  remaining: number;
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

export interface SubmitLeaveRequestPayload {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  files?: File[];
}

export interface UpdateLeaveRequestPayload {
  leaveType?: LeaveType;
  startDate?: string;
  endDate?: string;
  days?: number;
  reason?: string;
}
