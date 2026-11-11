import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
import type { AssetStatus } from './company-asset.types';

export type InspectionRepairUrgency =
  | 'CRITICAL'
  | 'URGENT'
  | 'MEDIUM'
  | 'MINOR';

export type InspectionRepairType =
  | 'INSPECTION'
  | 'MAINTENANCE'
  | 'REPAIR';

export type InspectionRepairStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REPAIR'
  | 'REPAIRED'
  | 'REJECTED';

export interface InspectionRepairUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface InspectionRepairAssetSummary {
  id: string;
  serialNumber: string;
  brand: string;
  model: string;
  year: number;
  type: string;
  status: AssetStatus;
  assignedAt?: string;
  description?: string | null;
}

export interface InspectionRepairListItem {
  id: string;
  requestNumber: string;
  companyId: string;
  employeeId: string;
  assetId?: string | null;
  deviceName: string;
  location: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  description: string;
  solution?: string | null;
  urgency: InspectionRepairUrgency;
  inspectionType: InspectionRepairType;
  status: InspectionRepairStatus;
  submittedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  employee?: InspectionRepairUserSummary;
  asset?: InspectionRepairAssetSummary | null;
}

export interface InspectionRepairDetail extends InspectionRepairListItem {
  approvalRequest?: {
    id: string;
    status: string;
    currentTier: number;
    tiers: Array<{
      id: string;
      tierOrder: number;
      label: string;
      decision: string;
      approver?: InspectionRepairUserSummary;
      comment?: string | null;
      decidedAt?: string | null;
    }>;
  } | null;
}

export interface SubmitInspectionRepairPayload extends OnBehalfPayload {
  assetId?: string;
  deviceName?: string;
  location: string;
  make?: string;
  model?: string;
  year?: number;
  description: string;
  solution?: string;
  urgency: InspectionRepairUrgency;
  inspectionType: InspectionRepairType;
}

export interface UpdateInspectionRepairPayload
  extends SubmitInspectionRepairPayload {
  status?: InspectionRepairStatus;
  completedAt?: string;
}

export interface ListInspectionRepairsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: InspectionRepairStatus | InspectionRepairStatus[];
  employeeId?: string;
  urgency?: InspectionRepairUrgency;
  inspectionType?: InspectionRepairType;
  dateFrom?: string;
  dateTo?: string;
}
