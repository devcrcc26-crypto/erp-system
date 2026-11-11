import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type { AssetStatus } from '@/lib/api/company-asset.types';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const ASSET_STATUS_OPTIONS: Array<{ value: AssetStatus; label: string }> = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'IN_USE', label: 'In Use' },
  { value: 'REPAIRING', label: 'Repairing' },
  { value: 'DISPOSED', label: 'Disposed' },
];

/** Statuses that can be set manually via Change Status (not IN_USE). */
export const ASSET_MANUAL_STATUS_OPTIONS: Array<{
  value: Exclude<AssetStatus, 'IN_USE'>;
  label: string;
}> = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'REPAIRING', label: 'Repairing' },
  { value: 'DISPOSED', label: 'Disposed' },
];

export function canChangeAssetStatusManually(status: AssetStatus): boolean {
  return status === 'AVAILABLE' || status === 'REPAIRING' || status === 'DISPOSED';
}

export function formatAssetStatus(
  status: AssetStatus | string,
  t?: TFn,
): string {
  if (t) return t(`hr.assetStatus.${status}`);
  const found = ASSET_STATUS_OPTIONS.find((o) => o.value === status);
  return found?.label ?? status;
}

export function assetStatusVariant(
  status: AssetStatus | string,
): StatusBadgeVariant {
  switch (status) {
    case 'AVAILABLE':
      return 'success';
    case 'IN_USE':
      return 'info';
    case 'REPAIRING':
      return 'warning';
    case 'DISPOSED':
    default:
      return 'error';
  }
}

export function getAssetStatusColor(status: AssetStatus | string): string {
  switch (status) {
    case 'AVAILABLE':
      return 'green';
    case 'IN_USE':
      return 'blue';
    case 'REPAIRING':
      return 'orange';
    case 'DISPOSED':
      return 'red';
    default:
      return 'default';
  }
}
