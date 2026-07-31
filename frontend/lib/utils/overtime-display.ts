import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  OvertimeCompensation,
  OvertimeStatus,
  OvertimeUserSummary,
} from '@/lib/api/overtime.types';
import { formatUserName } from '@/lib/utils/user-display';

export const OVERTIME_STATUS_OPTIONS: {
  value: OvertimeStatus;
  label: string;
}[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const OVERTIME_COMPENSATION_OPTIONS: {
  value: OvertimeCompensation;
  label: string;
}[] = [
  { value: 'EXTRA_PAY', label: 'Extra Pay' },
  { value: 'TIME_OFF_IN_LIEU', label: 'Time Off in Lieu' },
];

export function formatOvertimeStatus(status: OvertimeStatus): string {
  return (
    OVERTIME_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

export function overtimeStatusVariant(
  status: OvertimeStatus,
): StatusBadgeVariant {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
    case 'CANCELLED':
      return 'error';
    case 'RETURNED':
      return 'warning';
    case 'IN_REVIEW':
    case 'SUBMITTED':
      return 'info';
    default:
      return 'default';
  }
}

export function formatOvertimeCompensation(
  value: OvertimeCompensation | null | undefined,
): string {
  if (!value) {
    return '—';
  }
  return (
    OVERTIME_COMPENSATION_OPTIONS.find((option) => option.value === value)
      ?.label ?? value
  );
}

export function formatOvertimeEmployeeName(
  user?: OvertimeUserSummary | null,
): string {
  if (!user) {
    return '—';
  }
  return formatUserName(user);
}

/**
 * Hours between HH:mm times (overnight wraps to next day).
 */
export function calculateOvertimeHours(
  startTime: string,
  endTime: string,
): number | undefined {
  const startMatch = /^(\d{2}):(\d{2})$/.exec(startTime);
  const endMatch = /^(\d{2}):(\d{2})$/.exec(endTime);
  if (!startMatch || !endMatch) {
    return undefined;
  }
  const startMinutes =
    Number(startMatch[1]) * 60 + Number(startMatch[2]);
  let endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  return Math.round(((endMinutes - startMinutes) / 60) * 10) / 10;
}
