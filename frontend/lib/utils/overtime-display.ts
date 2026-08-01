import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  OvertimeSheetStatus,
  OvertimeUserSummary,
} from '@/lib/api/overtime.types';
import { formatUserName } from '@/lib/utils/user-display';

export const OVERTIME_STATUS_OPTIONS: {
  value: OvertimeSheetStatus;
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

export const OVERTIME_MONTH_OPTIONS: { value: number; label: string }[] =
  Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(Date.UTC(2000, i, 1)).toLocaleString('en', {
      month: 'long',
      timeZone: 'UTC',
    }),
  }));

export function formatOvertimeStatus(status: OvertimeSheetStatus): string {
  return (
    OVERTIME_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

export function overtimeStatusVariant(
  status: OvertimeSheetStatus,
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

export function formatOvertimeEmployeeName(
  user?: OvertimeUserSummary | null,
): string {
  if (!user) {
    return '—';
  }
  return formatUserName(user);
}

export function formatOvertimePeriod(month: number, year: number): string {
  const label =
    OVERTIME_MONTH_OPTIONS.find((m) => m.value === month)?.label ??
    String(month);
  return `${label} ${year}`;
}

export function formatOvertimeHours(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '0';
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
