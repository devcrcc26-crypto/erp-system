import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
export type MaterialRequisitionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export interface MaterialRequisitionUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface MaterialRequisitionProjectSummary {
  id: string;
  name: string;
  projectCode?: string | null;
}

export interface MaterialRequisitionDocumentSummary {
  id: string;
  name: string;
  fileType?: string;
  fileSizeBytes?: number;
}

export interface MaterialRequisitionItem {
  id: string;
  requisitionId: string;
  itemName: string;
  itemCode?: string | null;
  description?: string | null;
  quantity: number | string;
  unit: string;
}

export interface MaterialRequisitionListItem {
  id: string;
  requestNumber: string;
  employeeId: string;
  title: string;
  purpose: string;
  status: MaterialRequisitionStatus;
  itemCount: number;
  requiredByDate?: string | null;
  projectId?: string | null;
  warehouseLocation?: string | null;
  approvalRequestId?: string | null;
  currentTierLabel?: string | null;
  employee?: MaterialRequisitionUserSummary;
  project?: MaterialRequisitionProjectSummary;
  createdAt: string;
  submittedAt?: string | null;
  completedAt?: string | null;
}

export interface MaterialRequisitionDetail extends MaterialRequisitionListItem {
  items: MaterialRequisitionItem[];
  documents?: MaterialRequisitionDocumentSummary[];
  approvalRequest?: {
    id: string;
    status: string;
    currentTier: number;
    tiers: Array<{
      id: string;
      tierOrder: number;
      label: string;
      decision: string;
      conditions?: string | null;
      approver?: MaterialRequisitionUserSummary;
      comment?: string | null;
      decidedAt?: string | null;
    }>;
  } | null;
}

export interface CreateMaterialRequisitionPayload extends OnBehalfPayload {
  title: string;
  purpose: string;
  requiredByDate?: string;
  projectId?: string;
  warehouseLocation?: string;
}

export interface UpdateMaterialRequisitionPayload {
  title?: string;
  purpose?: string;
  requiredByDate?: string;
  projectId?: string;
  warehouseLocation?: string;
}

export interface AddMaterialRequisitionItemPayload {
  itemName: string;
  itemCode?: string;
  description?: string;
  quantity: number;
  unit: string;
}

export interface UpdateMaterialRequisitionItemPayload {
  itemName?: string;
  itemCode?: string;
  description?: string;
  quantity?: number;
  unit?: string;
}

export interface ListMaterialRequisitionsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: MaterialRequisitionStatus | MaterialRequisitionStatus[];
  employeeId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
}
