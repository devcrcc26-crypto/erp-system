import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  InspectionRepairStatus,
  InspectionRepairUserSummary,
} from '@/lib/api/inspection-repair.types';
import { formatUserName } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function formatInspectionRepairStatus(status: string, t?: TFn): string {
  if (t) {
    return t(`hr.status.${status}`);
  }
  return status;
}

export function inspectionRepairStatusVariant(
  status: InspectionRepairStatus | string,
): StatusBadgeVariant {
  switch (status) {
    case 'REPAIRED':
      return 'success';
    case 'REJECTED':
      return 'error';
    case 'IN_REPAIR':
      return 'warning';
    case 'SUBMITTED':
      return 'info';
    case 'DRAFT':
    default:
      return 'default';
  }
}

export function formatInspectionRepairEmployeeName(
  user?: InspectionRepairUserSummary | null,
): string {
  if (!user) {
    return '-';
  }
  return formatUserName(user);
}
