export type AssetRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'FULFILLED';

export interface AssetRequestUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface AssetRequestAssetSummary {
  id: string;
  assetTag: string;
  assetName: string;
  category?: string | null;
  assetType?: string | null;
}

export interface AssetRequestApprovalTier {
  id: string;
  tierOrder: number;
  label: string;
  decision: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';
  approver?: AssetRequestUserSummary | null;
}

export interface AssetRequestApprovalSummary {
  id: string;
  status: string;
  currentTier: number;
  tiers: AssetRequestApprovalTier[];
}

export interface AssetRequestDocument {
  id: string;
  name: string;
  fileType?: string | null;
  fileSizeBytes?: number | null;
}

export interface AssetRequestListItem {
  id: string;
  requestNumber: string;
  employeeId: string;
  assetCategory: string;
  assetType?: string | null;
  reason: string;
  requiredByDate?: string | null;
  notes?: string | null;
  status: AssetRequestStatus;
  approvalRequestId?: string | null;
  employee?: AssetRequestUserSummary | null;
  approvalRequest?: { id: string; status: string; currentTier: number } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetRequestDetail extends AssetRequestListItem {
  documents: AssetRequestDocument[];
  approvalRequest?: AssetRequestApprovalSummary | null;
  fulfilledByAsset?: AssetRequestAssetSummary | null;
  fulfilledByAssetId?: string | null;
  completedAt?: string | null;
  submittedAt?: string | null;
}

export interface CreateAssetRequestPayload {
  employeeId?: string;
  assetCategory: string;
  assetType?: string;
  reason: string;
  requiredByDate?: string;
  notes?: string;
}

export interface UpdateAssetRequestPayload {
  assetCategory?: string;
  assetType?: string;
  reason?: string;
  requiredByDate?: string | null;
  notes?: string | null;
}

export interface ListAssetRequestsParams {
  page?: number;
  limit?: number;
  employeeId?: string;
  status?: AssetRequestStatus | AssetRequestStatus[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FulfillAssetRequestPayload {
  assetId?: string;
}
