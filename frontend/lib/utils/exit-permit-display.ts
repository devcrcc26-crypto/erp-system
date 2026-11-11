import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  ExitPermitDepartmentSummary,
  ExitPermitDirection,
  ExitPermitStatus,
  ExitPermitUserSummary,
} from '@/lib/api/exit-permit.types';
import { formatUserName, isUuidLike } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const EXIT_PERMIT_STATUS_OPTIONS: Array<{
  value: ExitPermitStatus;
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

export const EXIT_PERMIT_DIRECTION_OPTIONS: Array<{
  value: ExitPermitDirection;
  label: string;
}> = [
  { value: 'EXIT', label: 'Exit' },
  { value: 'ENTRANCE', label: 'Entrance' },
];

export function formatExitPermitStatus(status: string, t?: TFn): string {
  if (t) return t(`hr.status.${status}`);
  const found = EXIT_PERMIT_STATUS_OPTIONS.find((o) => o.value === status);
  return found?.label ?? status;
}

export function formatExitPermitDirection(direction: string, t?: TFn): string {
  if (t) return t(`pages.hr.exitPermit.direction.${direction}`);
  const found = EXIT_PERMIT_DIRECTION_OPTIONS.find((o) => o.value === direction);
  return found?.label ?? direction;
}

export function exitPermitStatusVariant(
  status: ExitPermitStatus | string,
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

export function formatExitPermitEmployeeName(
  user?: ExitPermitUserSummary | string | null,
): string {
  if (!user) return '-';
  if (typeof user === 'string') {
    return isUuidLike(user) ? 'Unknown user' : user.trim() || '-';
  }
  return formatUserName(user);
}

export function formatExitPermitDepartmentName(
  department?: ExitPermitDepartmentSummary | null,
): string {
  if (!department) return '-';
  const english = department.name?.trim();
  const chinese = department.nameZh?.trim();
  if (english && chinese) {
    return `${english} (${chinese})`;
  }
  return english || chinese || '-';
}
