import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
export type SupportedCurrency = 'ETB' | 'USD' | 'CNY';

export type PurchaseRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export interface PurchaseRequestUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface PurchaseRequestDocumentSummary {
  id: string;
  name: string;
  fileType?: string;
  fileSizeBytes?: number;
}

export interface PurchaseRequestItem {
  id: string;
  requestId: string;
  itemName: string;
  modelSpec?: string | null;
  description?: string | null;
  quantity: number | string;
  unit: string;
  unitPrice: number | string;
  currency: SupportedCurrency;
  totalPrice: number | string;
  totalPriceEtb: number | string;
  exchangeRate?: number | string;
  image?: PurchaseRequestDocumentSummary | null;
  images?: PurchaseRequestDocumentSummary[];
}

export interface PurchaseRequestListItem {
  id: string;
  requestNumber: string;
  employeeId: string;
  title: string;
  justification: string;
  status: PurchaseRequestStatus;
  totalEstimatedCost: number | string;
  totalEstimatedEtb: number | string;
  currency: string;
  itemCount: number;
  requiredByDate?: string | null;
  vendorName?: string | null;
  vendorEmail?: string | null;
  vendorPhone?: string | null;
  approvalRequestId?: string | null;
  currentTierLabel?: string | null;
  employee?: PurchaseRequestUserSummary;
  createdAt: string;
  submittedAt?: string | null;
  completedAt?: string | null;
}

export interface PurchaseRequestDetail extends PurchaseRequestListItem {
  items: PurchaseRequestItem[];
  documents?: PurchaseRequestDocumentSummary[];
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
      approver?: PurchaseRequestUserSummary;
      comment?: string | null;
      decidedAt?: string | null;
    }>;
  } | null;
}

export interface CreatePurchaseRequestPayload extends OnBehalfPayload {
  title: string;
  justification: string;
  requiredByDate?: string;
  vendorName?: string;
  vendorEmail?: string;
  vendorPhone?: string;
}

export interface UpdatePurchaseRequestPayload {
  title?: string;
  justification?: string;
  requiredByDate?: string;
  vendorName?: string;
  vendorEmail?: string;
  vendorPhone?: string;
}

export interface AddPurchaseRequestItemPayload {
  itemName: string;
  modelSpec?: string;
  description?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  currency: SupportedCurrency;
  /** One or more reference images for the line item. */
  files?: File[];
  /** @deprecated Use files — kept for single-file update flows. */
  file?: File;
}

export interface UpdatePurchaseRequestItemPayload {
  itemName?: string;
  modelSpec?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  currency?: SupportedCurrency;
  files?: File[];
  file?: File;
}

export interface ListPurchaseRequestsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: PurchaseRequestStatus | PurchaseRequestStatus[];
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
}
