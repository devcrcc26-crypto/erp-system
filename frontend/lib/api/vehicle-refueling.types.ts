import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
import type { FuelType } from './company-vehicle.types';

export type VehicleRefuelingStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export interface VehicleRefuelingUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface VehicleRefuelingVehicleSummary {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
}

export interface VehicleRefuelingReceiptDocument {
  id: string;
  name: string;
  fileKey: string;
  fileType: string;
  fileSizeBytes: number;
}

export interface VehicleRefuelingListItem {
  id: string;
  requestNumber: string;
  employeeId: string;
  vehicleId: string;
  driverId?: string | null;
  fuelDate: string;
  fuelType: FuelType;
  fuelStation: string;
  currentMileage?: number | string | null;
  requestedLitres?: number | string | null;
  unitPriceEtb?: number | string | null;
  totalCostEtb?: number | string | null;
  notes?: string | null;
  status: VehicleRefuelingStatus;
  approvalRequestId?: string | null;
  receiptDocumentId?: string | null;
  currentTierLabel?: string | null;
  directApproved?: boolean;
  employee?: VehicleRefuelingUserSummary;
  driver?: VehicleRefuelingUserSummary | null;
  vehicle?: VehicleRefuelingVehicleSummary;
  createdAt: string;
  submittedAt?: string | null;
  completedAt?: string | null;
}

export interface VehicleRefuelingDetail extends VehicleRefuelingListItem {
  receiptDocument?: VehicleRefuelingReceiptDocument | null;
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
      approver?: VehicleRefuelingUserSummary;
      comment?: string | null;
      decidedAt?: string | null;
    }>;
  } | null;
}

export interface SubmitVehicleRefuelingPayload extends OnBehalfPayload {
  vehicleId: string;
  driverId?: string;
  fuelDate: string;
  fuelType: FuelType;
  fuelStation: string;
  currentMileage?: number;
  requestedLitres?: number;
  unitPriceEtb?: number;
  notes?: string;
}

export interface ListVehicleRefuelingsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: VehicleRefuelingStatus | VehicleRefuelingStatus[];
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export { FuelType };
