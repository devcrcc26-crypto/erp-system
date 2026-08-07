import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  DriveType,
  VehicleApplicationStatus,
  VehicleApplicationUserSummary,
} from '@/lib/api/vehicle-application.types';
import { formatUserName } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const VEHICLE_APPLICATION_STATUS_OPTIONS: Array<{
  value: VehicleApplicationStatus;
  label: string;
}> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const DRIVE_TYPE_OPTIONS: Array<{ value: DriveType; label: string }> = [
  { value: 'COMPANY_DRIVER', label: 'Company Driver' },
  { value: 'SELF_DRIVE', label: 'Self Drive' },
];

export function formatVehicleApplicationStatus(
  status: string,
  t?: TFn,
): string {
  if (t) return t(`hr.status.${status}`);
  const found = VEHICLE_APPLICATION_STATUS_OPTIONS.find(
    (o) => o.value === status,
  );
  return found?.label ?? status;
}

export function vehicleApplicationStatusVariant(
  status: VehicleApplicationStatus | string,
): StatusBadgeVariant {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'error';
    case 'RETURNED':
      return 'warning';
    case 'SUBMITTED':
      return 'info';
    case 'IN_REVIEW':
      return 'warning';
    case 'CANCELLED':
    case 'DRAFT':
    default:
      return 'default';
  }
}

export function formatDriveType(
  driveType: DriveType | string,
  t?: TFn,
): string {
  if (t) return t(`hr.driveType.${driveType}`);
  const found = DRIVE_TYPE_OPTIONS.find((o) => o.value === driveType);
  return found?.label ?? driveType;
}

export function formatVehicleApplicationEmployeeName(
  user?: VehicleApplicationUserSummary | null,
): string {
  if (!user) return '-';
  return formatUserName(user);
}
