export type VehicleType =
  | 'CAR'
  | 'TRUCK'
  | 'VAN'
  | 'BUS'
  | 'PICKUP'
  | 'MOTORCYCLE'
  | 'OTHER';

export type FuelType = 'PETROL' | 'DIESEL' | 'ELECTRIC' | 'HYBRID';

export type VehicleStatus =
  | 'AVAILABLE'
  | 'APPROVED'
  | 'IN_USE'
  | 'MAINTENANCE'
  | 'RETIRED';

export interface CompanyVehicleDriverSummary {
  id: string;
  firstName: string;
  lastName: string;
}

export interface CompanyVehicleListItem {
  id: string;
  plateNumber: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  year: number;
  fuelType: FuelType;
  color?: string | null;
  assignedDriverId?: string | null;
  assignedDriver?: CompanyVehicleDriverSummary | null;
  status: VehicleStatus;
  notes?: string | null;
  photoDocumentId?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CompanyVehicleDetail extends CompanyVehicleListItem {}

export interface AvailableVehicle extends CompanyVehicleListItem {
  isAvailable: boolean;
  conflictPeriod: {
    from: string;
    to: string;
    applicationNumber: string;
  } | null;
}

export interface CreateCompanyVehiclePayload {
  plateNumber: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  year: number;
  fuelType?: FuelType;
  color?: string;
  assignedDriverId?: string;
  notes?: string;
  isActive?: boolean;
}

export interface UpdateCompanyVehiclePayload {
  plateNumber?: string;
  vehicleType?: VehicleType;
  make?: string;
  model?: string;
  year?: number;
  fuelType?: FuelType;
  color?: string;
  assignedDriverId?: string;
  notes?: string;
  isActive?: boolean;
}

export interface UpdateCompanyVehicleStatusPayload {
  status: VehicleStatus;
}

export interface ListCompanyVehiclesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: VehicleStatus;
}

export interface AvailableVehiclesParams {
  departureDatetime: string;
  returnDatetime: string;
}
