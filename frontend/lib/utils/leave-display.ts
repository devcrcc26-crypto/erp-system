import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  LeaveRequestStatus,
  LeaveType,
  LeaveUserSummary,
} from '@/lib/api/leave.types';
import { formatUserName } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const DEDUCTS_FROM_ANNUAL: LeaveType[] = [
  'STUDY',
  'EXAM',
  'EMERGENCY',
  'PATERNITY',
  'COMPASSIONATE',
];

export const OWN_BALANCE_LEAVE_TYPES: LeaveType[] = [
  'ANNUAL',
  'MATERNITY',
  'SICK',
];

/** Unpaid leave never consumes a leave-balance bucket. */
export function leaveTypeAffectsBalance(leaveType: LeaveType): boolean {
  return leaveType !== 'UNPAID';
}

export function resolveBalanceLeaveType(leaveType: LeaveType): LeaveType {
  switch (leaveType) {
    case 'ANNUAL':
    case 'STUDY':
    case 'EXAM':
    case 'EMERGENCY':
    case 'PATERNITY':
    case 'COMPASSIONATE':
      return 'ANNUAL';
    case 'MATERNITY':
      return 'MATERNITY';
    case 'SICK':
      return 'SICK';
    case 'UNPAID':
      return 'ANNUAL';
    default:
      return 'ANNUAL';
  }
}

export const LEAVE_TYPE_OPTIONS: Array<{ value: LeaveType; label: string }> = [
  { value: 'ANNUAL', label: 'Annual' },
  { value: 'SICK', label: 'Sick' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'MATERNITY', label: 'Maternity' },
  { value: 'PATERNITY', label: 'Paternity' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'COMPASSIONATE', label: 'Compassionate' },
  { value: 'STUDY', label: 'Study' },
  { value: 'EXAM', label: 'Exam' },
];

export const LEAVE_STATUS_OPTIONS: Array<{
  value: LeaveRequestStatus;
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

export function formatLeaveType(leaveType: LeaveType | string, t?: TFn): string {
  if (t) return t(`hr.leaveType.${leaveType}`);
  const found = LEAVE_TYPE_OPTIONS.find((o) => o.value === leaveType);
  if (found) {
    return found.label;
  }
  return leaveType
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function formatLeaveStatus(status: string, t?: TFn): string {
  if (t) return t(`hr.status.${status}`);
  return status
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function leaveStatusVariant(
  status: LeaveRequestStatus | string,
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

export function leaveTypeVariant(
  leaveType: LeaveType | string,
): StatusBadgeVariant {
  switch (leaveType) {
    case 'ANNUAL':
      return 'info';
    case 'SICK':
      return 'orange';
    case 'UNPAID':
      return 'default';
    case 'MATERNITY':
    case 'PATERNITY':
      return 'cyan';
    case 'EMERGENCY':
      return 'error';
    case 'COMPASSIONATE':
      return 'warning';
    case 'STUDY':
    case 'EXAM':
      return 'info';
    default:
      return 'default';
  }
}

export function formatLeaveEmployeeName(
  user?: LeaveUserSummary | null,
): string {
  if (!user) {
    return '-';
  }
  return formatUserName(user);
}

/**
 * Inclusive calendar-day count between two YYYY-MM-DD dates.
 */
export function calculateLeaveDays(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): number | undefined {
  if (!startDate || !endDate) {
    return undefined;
  }
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return undefined;
  }
  if (end.getTime() < start.getTime()) {
    return undefined;
  }
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / 86_400_000) + 1;
}
