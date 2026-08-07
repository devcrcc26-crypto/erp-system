import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  CompanyVehicleDriverSummary,
  FuelType,
  VehicleStatus,
  VehicleType,
} from '@/lib/api/company-vehicle.types';
import type { User } from '@/lib/api/types';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

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

export function formatVehicleType(type: VehicleType | string, t?: TFn): string {
  if (t) return t(`hr.vehicleType.${type}`);
  const found = VEHICLE_TYPE_OPTIONS.find((o) => o.value === type);
  return found?.label ?? type;
}

export function formatFuelType(type: FuelType | string, t?: TFn): string {
  if (t) return t(`hr.fuelType.${type}`);
  const found = FUEL_TYPE_OPTIONS.find((o) => o.value === type);
  return found?.label ?? type;
}

export function formatVehicleStatus(
  status: VehicleStatus | string,
  t?: TFn,
): string {
  if (t) return t(`hr.vehicleStatus.${status}`);
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

/** Users whose position title includes the word Driver. */
export function isDriverUser(user: User): boolean {
  const title = user.position?.title?.trim() ?? '';
  return /\bdriver\b/i.test(title);
}

/** Select options for assigned-driver pickers. */
export function toDriverSelectOptions(
  users: User[],
  includeUserIds: string[] = [],
): Array<{ value: string; label: string }> {
  const include = new Set(includeUserIds.filter(Boolean));
  return users
    .filter((user) => isDriverUser(user) || include.has(user.id))
    .map((user) => {
      const name = `${user.firstName} ${user.lastName}`.trim();
      const position = user.position?.title?.trim();
      return {
        value: user.id,
        label: position ? `${name} — ${position}` : name,
      };
    });
}
