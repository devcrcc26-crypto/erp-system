export type AssetStatus = 'AVAILABLE' | 'IN_USE' | 'REPAIRING' | 'DISPOSED';

export interface CompanyAssetListItem {
  id: string;
  serialNumber: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  type: string;
  status: AssetStatus;
  description?: string | null;
  photoDocumentId?: string | null;
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
