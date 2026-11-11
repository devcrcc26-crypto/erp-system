import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  CompanyVehicleDriverSummary,
  FuelType,
  VehicleStatus,
  VehicleType,
} from '@/lib/api/company-vehicle.types';
import type { User } from '@/lib/api/types';
import { formatUserName } from '@/lib/utils/user-display';

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

export function vehicleTypeSelectOptions(
  t: TFn,
): Array<{ value: VehicleType; label: string }> {
  return VEHICLE_TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`hr.vehicleType.${option.value}`),
  }));
}

export function fuelTypeSelectOptions(
  t: TFn,
): Array<{ value: FuelType; label: string }> {
  return FUEL_TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`hr.fuelType.${option.value}`),
  }));
}

export function vehicleStatusSelectOptions(
  t: TFn,
): Array<{ value: VehicleStatus; label: string }> {
  return VEHICLE_STATUS_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`hr.vehicleStatus.${option.value}`),
  }));
}

const MANUAL_VEHICLE_STATUS_CHANGES: VehicleStatus[] = [
  'APPROVED',
  'MAINTENANCE',
  'RETIRED',
];

/** Status options for manual fleet status changes (excludes operational states). */
export function vehicleStatusChangeSelectOptions(
  t: TFn,
): Array<{ value: VehicleStatus; label: string }> {
  return vehicleStatusSelectOptions(t).filter((option) =>
    MANUAL_VEHICLE_STATUS_CHANGES.includes(option.value),
  );
}

/** Initial selection when opening the change-status dialog. */
export function initialVehicleStatusChangeSelection(
  currentStatus: VehicleStatus,
): VehicleStatus | undefined {
  return MANUAL_VEHICLE_STATUS_CHANGES.includes(currentStatus)
    ? currentStatus
    : undefined;
}

export function formatDriverName(
  driver?: CompanyVehicleDriverSummary | null,
): string {
  if (!driver) return '-';
  return formatUserName(driver);
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
      const name = formatUserName(user);
      const position = user.position?.title?.trim();
      return {
        value: user.id,
        label: position ? `${name} - ${position}` : name,
      };
    });
}
