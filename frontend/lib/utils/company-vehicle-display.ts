import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  CompanyVehicleDriverSummary,
  FuelType,
  VehicleStatus,
  VehicleType,
} from '@/lib/api/company-vehicle.types';

export const VEHICLE_TYPE_OPTIONS: Array<{ value: VehicleType; label: string }> = [
  { value: 'CAR', label: 'Car' },
  { value: 'TRUCK', label: 'Truck' },
  { value: 'VAN', label: 'Van' },
  { value: 'BUS', label: 'Bus' },
  { value: 'PICKUP', label: 'Pickup' },
  { value: 'MOTORCYCLE', label: 'Motorcycle' },
  { value: 'OTHER', label: 'Other' },
];

export const FUEL_TYPE_OPTIONS: Array<{ value: FuelType; label: string }> = [
  { value: 'PETROL', label: 'Petrol' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'ELECTRIC', label: 'Electric' },
  { value: 'HYBRID', label: 'Hybrid' },
];

export const VEHICLE_STATUS_OPTIONS: Array<{ value: VehicleStatus; label: string }> = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'IN_USE', label: 'In Use' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'RETIRED', label: 'Retired' },
];

export function formatVehicleType(type: VehicleType | string): string {
  const found = VEHICLE_TYPE_OPTIONS.find((o) => o.value === type);
  return found?.label ?? type;
}

export function formatFuelType(type: FuelType | string): string {
  const found = FUEL_TYPE_OPTIONS.find((o) => o.value === type);
  return found?.label ?? type;
}

export function formatVehicleStatus(status: VehicleStatus | string): string {
  const found = VEHICLE_STATUS_OPTIONS.find((o) => o.value === status);
  return found?.label ?? status;
}

export function vehicleStatusVariant(
  status: VehicleStatus | string,
): StatusBadgeVariant {
  switch (status) {
    case 'AVAILABLE':
      return 'success';
    case 'APPROVED':
      return 'info';
    case 'IN_USE':
      return 'warning';
    case 'MAINTENANCE':
      return 'warning';
    case 'RETIRED':
    default:
      return 'default';
  }
}

export function formatDriverName(
  driver?: CompanyVehicleDriverSummary | null,
): string {
  if (!driver) return '-';
  return `${driver.firstName} ${driver.lastName}`;
}
