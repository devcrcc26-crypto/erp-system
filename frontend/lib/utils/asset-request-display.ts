import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type { AssetRequestStatus, AssetRequestUserSummary } from '@/lib/api/asset-request.types';
import { formatUserName } from '@/lib/utils/user-display';

export const ASSET_REQUEST_STATUS_OPTIONS: Array<{
  value: AssetRequestStatus;
  label: string;
}> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'FULFILLED', label: 'Fulfilled' },
];

export function formatAssetRequestStatus(status: string): string {
  return ASSET_REQUEST_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function assetRequestStatusVariant(
  status: AssetRequestStatus | string,
): StatusBadgeVariant {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'FULFILLED':
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

export function formatAssetRequestEmployeeName(
  user?: AssetRequestUserSummary | null,
): string {
  if (!user) return '-';
  return formatUserName(user);
}
