import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
export type VehicleApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export type DriveType = 'COMPANY_DRIVER' | 'SELF_DRIVE';

export interface VehicleApplicationUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface VehicleApplicationVehicleSummary {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
}

export interface VehicleApplicationProjectSummary {
  id: string;
  projectCode: string;
  name: string;
}

export interface VehicleApplicationListItem {
  id: string;
  applicationNumber: string;
  employeeId: string;
  vehicleId: string;
  driveType: DriveType;
  driverId?: string | null;
  departureDatetime: string;
  returnDatetime: string;
  destination: string;
  purpose: string;
  passengerCount: number;
  passengerNames?: string | null;
  projectId?: string | null;
  notes?: string | null;
  status: VehicleApplicationStatus;
  approvalRequestId?: string | null;
  releasedAt?: string | null;
  releasedBy?: string | null;
  currentTierLabel?: string | null;
  directApproved?: boolean;
  employee?: VehicleApplicationUserSummary;
  driver?: VehicleApplicationUserSummary | null;
  vehicle?: VehicleApplicationVehicleSummary;
  project?: VehicleApplicationProjectSummary | null;
  createdAt: string;
  submittedAt?: string | null;
  completedAt?: string | null;
}

export interface VehicleApplicationDetail extends VehicleApplicationListItem {
  releasedByUser?: VehicleApplicationUserSummary | null;
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
      approver?: VehicleApplicationUserSummary;
      comment?: string | null;
      decidedAt?: string | null;
    }>;
  } | null;
  vehicle?: VehicleApplicationVehicleSummary & {
    assignedDriver?: { id: string; firstName: string; lastName: string } | null;
  };
}

export interface SubmitVehicleApplicationPayload extends OnBehalfPayload {
  vehicleId: string;
  driveType: DriveType;
  driverId?: string;
  departureDatetime: string;
  returnDatetime: string;
  destination: string;
  purpose: string;
  passengerCount?: number;
  passengerNames?: string;
  projectId?: string;
  notes?: string;
}

/** PATCH body when the employee edits a DRAFT / RETURNED application. */
export type UpdateVehicleApplicationPayload = Omit<
  SubmitVehicleApplicationPayload,
  keyof OnBehalfPayload
>;

export interface ListVehicleApplicationsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: VehicleApplicationStatus | VehicleApplicationStatus[];
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}
