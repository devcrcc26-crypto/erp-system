import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  VehicleRefuelingStatus,
  VehicleRefuelingUserSummary,
} from '@/lib/api/vehicle-refueling.types';
import { formatUserName } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const VEHICLE_REFUELING_STATUS_OPTIONS: Array<{
  value: VehicleRefuelingStatus;
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

export function formatVehicleRefuelingStatus(status: string, t?: TFn): string {
  if (t) return t(`hr.status.${status}`);
  const found = VEHICLE_REFUELING_STATUS_OPTIONS.find(
    (o) => o.value === status,
  );
  return found?.label ?? status;
}

export function vehicleRefuelingStatusVariant(
  status: VehicleRefuelingStatus | string,
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

export function formatVehicleRefuelingEmployeeName(
  user?: VehicleRefuelingUserSummary | null,
): string {
  if (!user) return '-';
  return formatUserName(user);
}
