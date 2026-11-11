import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  MaterialRequisitionStatus,
  MaterialRequisitionUserSummary,
} from '@/lib/api/material-requisition.types';
import { formatUserName } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const MATERIAL_REQUISITION_STATUS_OPTIONS: Array<{
  value: MaterialRequisitionStatus;
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

export function formatMaterialRequisitionStatus(
  status: string,
  t?: TFn,
): string {
  if (t) return t(`hr.status.${status}`);
  const found = MATERIAL_REQUISITION_STATUS_OPTIONS.find(
    (o) => o.value === status,
  );
  return found?.label ?? status;
}

export function materialRequisitionStatusVariant(
  status: MaterialRequisitionStatus | string,
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

export function formatMaterialRequisitionEmployeeName(
  user?: MaterialRequisitionUserSummary | null,
): string {
  if (!user) return '-';
  return formatUserName(user);
}
