import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
export type SupportedCurrency = 'ETB' | 'USD' | 'CNY';

export type ExpenseClaimStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export interface ExpenseClaimUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface ExpenseClaimDocumentSummary {
  id: string;
  name: string;
  fileType?: string;
  fileSizeBytes?: number;
}

export interface ExpenseClaimItem {
  id: string;
  claimId: string;
  category: string;
  description: string;
  amount: number | string;
  currency: SupportedCurrency;
  amountEtb: number | string;
  exchangeRate: number | string;
  expenseDate: string;
  /** One item can carry several receipt files. */
  receipts: ExpenseClaimItemReceipt[];
}

export interface ExpenseClaimItemReceipt {
  id: string;
  documentId: string;
  document?: ExpenseClaimDocumentSummary | null;
}

export interface ExpenseClaimListItem {
  id: string;
  companyId: string;
  claimNumber: string;
  employeeId: string;
  title: string;
  description?: string | null;
  status: ExpenseClaimStatus;
  totalAmountEtb: number | string;
  itemCount: number;
  approvalRequestId?: string | null;
  employee?: ExpenseClaimUserSummary;
  createdAt: string;
  submittedAt?: string | null;
  completedAt?: string | null;
  paidAt?: string | null;
  paymentReference?: string | null;
  paidBy?: ExpenseClaimUserSummary | null;
}

export interface MarkExpenseClaimPaidPayload {
  paidDate?: string;
  paymentReference?: string;
}

export interface ExpenseClaimDetail extends ExpenseClaimListItem {
  items: ExpenseClaimItem[];
  approvalRequest?: {
    id: string;
    status: string;
    currentTier: number;
    tiers: Array<{
      id: string;
      tierOrder: number;
      label: string;
      decision: string;
      approver?: ExpenseClaimUserSummary;
      comment?: string | null;
      decidedAt?: string | null;
    }>;
  } | null;
}

export interface CreateExpenseClaimPayload extends OnBehalfPayload {
  title: string;
  description?: string;
}

export interface UpdateExpenseClaimPayload {
  title?: string;
  description?: string;
}

export interface AddExpenseClaimItemPayload {
  category: string;
  description: string;
  expenseDate: string;
  amount: number;
  currency: SupportedCurrency;
  /** All receipt files for this one item. */
  files?: File[];
}

export interface UpdateExpenseClaimItemPayload {
  category?: string;
  description?: string;
  expenseDate?: string;
  amount?: number;
  currency?: SupportedCurrency;
  /** When set, these files replace the item's receipts. */
  files?: File[];
}

export interface ListExpenseClaimsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ExpenseClaimStatus | ExpenseClaimStatus[];
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}
