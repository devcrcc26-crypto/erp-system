export type OvertimeStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export type OvertimeCompensation = 'EXTRA_PAY' | 'TIME_OFF_IN_LIEU';

export interface OvertimeUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  chineseName?: string | null;
}

export interface OvertimeProjectSummary {
  id: string;
  projectCode: string;
  name: string;
  nameZh?: string | null;
}

export interface OvertimeApprovalTier {
  id: string;
  tierOrder: number;
  label: string;
  approverId: string;
  resolver: string;
  decision: string;
  comment?: string | null;
  conditions?: unknown;
  decidedAt?: string | null;
  approver?: OvertimeUserSummary;
}

export interface OvertimeApprovalSummary {
  id: string;
  status: string;
  currentTier?: number;
  category?: { id: string; code: string; name: string; icon?: string | null };
  tiers?: OvertimeApprovalTier[];
}

export interface OvertimeRequestListItem {
  id: string;
  companyId: string;
  requestNumber: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  reason: string;
  projectId?: string | null;
  compensationType?: OvertimeCompensation | null;
  status: OvertimeStatus;
  approvalRequestId?: string | null;
  submittedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: OvertimeUserSummary;
  project?: OvertimeProjectSummary | null;
  approvalRequest?: Pick<
    OvertimeApprovalSummary,
    'id' | 'status' | 'currentTier'
  > | null;
}

export interface OvertimeRequestDetail extends OvertimeRequestListItem {
  creator?: OvertimeUserSummary;
  approvalRequest?: OvertimeApprovalSummary | null;
}

export interface ListOvertimeRequestsParams {
  page?: number;
  limit?: number;
  status?: OvertimeStatus | OvertimeStatus[];
  employeeId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface SubmitOvertimeRequestPayload {
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  reason: string;
  projectId?: string;
  compensationType?: OvertimeCompensation;
}
