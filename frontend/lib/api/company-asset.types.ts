export type AssetStatus = 'AVAILABLE' | 'IN_USE' | 'REPAIRING' | 'DISPOSED';

export interface AssetUserRef {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface CompanyAssetAssignmentListItem {
  id: string;
  companyId: string;
  assetId: string;
  userId: string; // employeeId
  assignedAt: string;
  notes?: string | null;
  returnedTo?: string | null;
  returnedAt?: string | null;
  returnedNotes?: string | null;
  employee: AssetUserRef;
  issuedBy?: AssetUserRef | null;
  returnedBy?: AssetUserRef | null;
}

export interface CompanyAssetDepreciationFields {
  monthsDepreciated: number;
  monthlyDepreciation?: number | string | null;
  accumulatedDepreciation?: number | string | null;
  netValue?: number | string | null;
  depreciationPercent?: number | string | null;
}

export interface CompanyAssetListItem extends CompanyAssetDepreciationFields {
  id: string;
  serialNumber: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  type: string;
  status: AssetStatus;
  description?: string | null;
  assetCode?: string | null;
  cardNumber?: string | null;
  assetName?: string | null;
  specifications?: string | null;
  assetCategory?: string | null;
  startUseDate?: string | null;
  usefulLifeMonths?: number | null;
  originalValue?: number | string | null;
  managingDepartment?: string | null;
  storageLocation?: string | null;
  photoDocumentId?: string | null;
  assignedTo?: AssetUserRef | null;
  assignedAt?: string | null;
  createdAt: string;
}

export interface CompanyAssetDetail extends CompanyAssetListItem {
  companyId: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CreateCompanyAssetPayload {
  serialNumber: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  type: string;
  description?: string;
  assetCode?: string;
  cardNumber?: string;
  assetName?: string;
  specifications?: string;
  assetCategory?: string;
  startUseDate?: string;
  usefulLifeMonths?: number;
  originalValue?: number;
  managingDepartment?: string;
  storageLocation?: string;
  photoDocumentId?: string;
}

export interface UpdateCompanyAssetPayload {
  serialNumber?: string;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  type?: string;
  description?: string;
  assetCode?: string;
  cardNumber?: string;
  assetName?: string;
  specifications?: string;
  assetCategory?: string;
  startUseDate?: string;
  usefulLifeMonths?: number;
  originalValue?: number;
  managingDepartment?: string;
  storageLocation?: string;
  photoDocumentId?: string;
}

export interface UpdateCompanyAssetStatusPayload {
  status: AssetStatus;
}

export interface ListCompanyAssetsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: AssetStatus;
  type?: string;
}

export interface ListCompanyAssetAssignmentsParams {
  page?: number;
  limit?: number;
  includeReturned?: boolean;
  employeeId?: string;
}

export interface IssueCompanyAssetAssignmentPayload {
  employeeId: string;
  notes?: string;
}

export interface ReturnCompanyAssetAssignmentPayload {
  returnedTo?: string;
  returnedNotes?: string;
}
