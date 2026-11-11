import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  OvertimeSheetStatus,
  OvertimeUserSummary,
} from '@/lib/api/overtime.types';
import { formatUserName } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

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

export function formatOvertimeStatus(
  status: OvertimeSheetStatus,
  t?: TFn,
): string {
  if (t) return t(`hr.status.${status}`);
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
      return 'error';
    case 'RETURNED':
      return 'warning';
    case 'SUBMITTED':
      return 'info';
    case 'IN_REVIEW':
      return 'warning';
    case 'CANCELLED':
    default:
      return 'default';
  }
}

export function formatOvertimeEmployeeName(
  user?: OvertimeUserSummary | null,
): string {
  if (!user) {
    return '-';
  }
  return formatUserName(user);
}

export function formatOvertimePeriod(
  month: number,
  year: number,
  t?: TFn,
): string {
  if (t) return `${t(`hr.months.${month}`)} ${year}`;
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

/**
 * Unregistered holiday dates stored on overtime approval formData.
 */
export function unregisteredHolidayDatesFromFormData(
  formData: Record<string, unknown> | null | undefined,
): string[] {
  const raw = formData?.unregisteredHolidayDates;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((value): value is string => typeof value === 'string');
}
