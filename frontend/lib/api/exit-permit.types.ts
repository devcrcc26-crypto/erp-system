import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
export type ExitPermitStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export type ExitPermitDirection = 'ENTRANCE' | 'EXIT';

export interface ExitPermitUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface ExitPermitDepartmentSummary {
  id: string;
  name: string;
  nameZh?: string | null;
}

export interface ExitPermitDocumentSummary {
  id: string;
  name: string;
  fileType?: string;
  fileSizeBytes?: number;
}

export interface ExitPermitItem {
  id: string;
  requestId: string;
  itemName: string;
  issue?: string | null;
  quantity: number | string;
  unit?: string | null;
  documentId?: string | null;
  image?: ExitPermitDocumentSummary | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExitPermitApprovalTierSummary {
  id?: string;
  tierOrder: number;
  label: string;
  decision?: string;
  conditions?: string | null;
  approver?: ExitPermitUserSummary;
  comment?: string | null;
  decidedAt?: string | null;
}

export interface ExitPermitApprovalRequestSummary {
  id: string;
  status: string;
  currentTier: number;
  tiers?: ExitPermitApprovalTierSummary[];
}

export interface ExitPermitListItem {
  id: string;
  companyId: string;
  requestNumber: string;
  employeeId: string;
  departmentId?: string | null;
  direction: ExitPermitDirection;
  date: string;
  status: ExitPermitStatus;
  isOnBehalf: boolean;
  approvalRequestId?: string | null;
  attachmentFolderId?: string | null;
  itemCount: number;
  currentTierLabel?: string | null;
  employee?: ExitPermitUserSummary;
  creator?: ExitPermitUserSummary;
  submitter?: ExitPermitUserSummary | null;
  department?: ExitPermitDepartmentSummary | null;
  approvalRequest?: ExitPermitApprovalRequestSummary | null;
  createdBy: string;
  submittedBy?: string | null;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  completedAt?: string | null;
}

export interface ExitPermitDetail extends ExitPermitListItem {
  items: ExitPermitItem[];
  documents?: ExitPermitDocumentSummary[];
  approvalRequest?: ExitPermitApprovalRequestSummary | null;
}

export interface CreateExitPermitItemPayload {
  itemName: string;
  issue?: string;
  quantity?: number;
  unit?: string;
  documentId?: string;
}

export interface CreateExitPermitPayload extends OnBehalfPayload {
  employeeId?: string;
  departmentId?: string;
  direction: ExitPermitDirection;
  date?: string;
  items?: CreateExitPermitItemPayload[];
}

export interface UpdateExitPermitPayload {
  employeeId?: string;
  departmentId?: string | null;
  direction?: ExitPermitDirection;
  date?: string;
  items?: CreateExitPermitItemPayload[];
}

export interface AddExitPermitItemPayload {
  itemName: string;
  issue?: string;
  quantity?: number;
  unit?: string;
  documentId?: string;
  file?: File;
}

export interface UpdateExitPermitItemPayload {
  itemName?: string;
  issue?: string;
  quantity?: number;
  unit?: string;
  documentId?: string;
  file?: File;
}

export interface ListExitPermitsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ExitPermitStatus | ExitPermitStatus[];
  employeeId?: string;
  direction?: ExitPermitDirection;
  dateFrom?: string;
  dateTo?: string;
}
