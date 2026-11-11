import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type { PerDiemStatus, PerDiemUserSummary } from '@/lib/api/per-diem.types';
import { formatUserName } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const PER_DIEM_STATUS_OPTIONS: Array<{
  value: PerDiemStatus;
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

export function formatPerDiemStatus(status: string, t?: TFn): string {
  if (t) return t(`hr.perDiemStatus.${status}`);
  const found = PER_DIEM_STATUS_OPTIONS.find((o) => o.value === status);
  return found?.label ?? status;
}

export function perDiemStatusVariant(
  status: PerDiemStatus | string,
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

export function formatPerDiemEmployeeName(
  user?: PerDiemUserSummary | null,
): string {
  if (!user) {
    return '-';
  }
  return formatUserName(user);
}

/**
 * Per diem amounts: the standard rate comes from the employee's rate table,
 * the approver may set a different approved rate, and the approved total
 * (approved rate × days) is what can be disbursed and what settlement uses.
 */
export interface PerDiemAmounts {
  standardRate: number;
  /** Null until an approver sets it. */
  approvedRate: number | null;
  days: number;
  /** Approved rate × days; the standard rate × days until a rate is approved. */
  approvedTotal: number;
  disbursed: number;
  /** Approved total minus everything disbursed so far (never below 0). */
  remaining: number;
}

export function perDiemAmounts(request: {
  dailyRate: number | string;
  approvedDailyRate?: number | string | null;
  days: number;
  disbursements?: ReadonlyArray<{ amount: number | string }> | null;
}): PerDiemAmounts {
  const standardRate = Number(request.dailyRate);
  const approvedRate =
    request.approvedDailyRate != null ? Number(request.approvedDailyRate) : null;
  const approvedTotal = (approvedRate ?? standardRate) * request.days;
  const disbursed = (request.disbursements ?? []).reduce(
    (sum, row) => sum + Number(row.amount),
    0,
  );
  return {
    standardRate,
    approvedRate,
    days: request.days,
    approvedTotal,
    disbursed,
    remaining: Math.max(0, approvedTotal - disbursed),
  };
}
