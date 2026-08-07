export type ConsumablesRequisitionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export interface ConsumablesRequisitionUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface ConsumablesRequisitionItem {
  id: string;
  requisitionId: string;
  itemName: string;
  itemCode?: string | null;
  description?: string | null;
  quantity: number | string;
  unit: string;
}

export interface ConsumablesRequisitionListItem {
  id: string;
  requestNumber: string;
  employeeId: string;
  title: string;
  purpose: string;
  department?: string | null;
  declarationConfirmed: boolean;
  status: ConsumablesRequisitionStatus;
  itemCount: number;
  requiredByDate?: string | null;
  approvalRequestId?: string | null;
  currentTierLabel?: string | null;
  directApproved?: boolean;
  employee?: ConsumablesRequisitionUserSummary;
  createdAt: string;
  submittedAt?: string | null;
  completedAt?: string | null;
}

export interface ConsumablesRequisitionDetail
  extends ConsumablesRequisitionListItem {
  items: ConsumablesRequisitionItem[];
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
      approver?: ConsumablesRequisitionUserSummary;
      comment?: string | null;
      decidedAt?: string | null;
    }>;
  } | null;
}

export interface CreateConsumablesRequisitionPayload {
  title: string;
  purpose: string;
  requiredByDate?: string;
  department?: string;
  declarationConfirmed?: boolean;
}

export interface UpdateConsumablesRequisitionPayload {
  title?: string;
  purpose?: string;
  requiredByDate?: string;
  department?: string;
  declarationConfirmed?: boolean;
}

export interface AddConsumablesRequisitionItemPayload {
  itemName: string;
  itemCode?: string;
  description?: string;
  quantity: number;
  unit: string;
}

export interface UpdateConsumablesRequisitionItemPayload {
  itemName?: string;
  itemCode?: string;
  description?: string;
  quantity?: number;
  unit?: string;
}

export interface ListConsumablesRequisitionsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ConsumablesRequisitionStatus | ConsumablesRequisitionStatus[];
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const CONSUMABLES_MAX_ITEMS = 20;
