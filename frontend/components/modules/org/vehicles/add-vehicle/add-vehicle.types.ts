import type { CreateCompanyVehiclePayload } from '@/lib/api/company-vehicle.types';

export type AddVehicleFormValues = CreateCompanyVehiclePayload;

export const ADD_VEHICLE_STEP_FIELDS = {
  identity: ['plateNumber', 'vehicleType'] as const,
  specifications: ['make', 'model', 'year'] as const,
  assignment: [] as const,
} as const;
