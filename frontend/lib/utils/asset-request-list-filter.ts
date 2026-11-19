import type {
  AssetRequestListItem,
  AssetRequestStatus,
} from '@/lib/api/asset-request.types';
import { formatAssetRequestEmployeeName } from '@/lib/utils/asset-request-display';

export type AssetRequestStatusMode = 'all' | 'pending' | 'approved' | 'rejected';

export const ASSET_REQUEST_PENDING_STATUSES: AssetRequestStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
];
export const ASSET_REQUEST_APPROVED_STATUSES: AssetRequestStatus[] = [
  'APPROVED',
  'FULFILLED',
];
export const ASSET_REQUEST_REJECTED_STATUSES: AssetRequestStatus[] = [
  'REJECTED',
  'CANCELLED',
];

export function statusesForAssetRequestMode(
  mode: AssetRequestStatusMode,
): AssetRequestStatus[] {
  switch (mode) {
    case 'pending':
      return ASSET_REQUEST_PENDING_STATUSES;
    case 'approved':
      return ASSET_REQUEST_APPROVED_STATUSES;
    case 'rejected':
      return ASSET_REQUEST_REJECTED_STATUSES;
    default:
      return [];
  }
}

/**
 * Client-side asset request search by number, category, type, or employee.
 */
export function matchesAssetRequestSearch(
  row: AssetRequestListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName = formatAssetRequestEmployeeName(row.employee).toLowerCase();
  const haystack = [
    row.requestNumber,
    row.id,
    row.employeeId,
    row.assetCategory,
    row.assetType ?? '',
    employeeName,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface AssetRequestListFilters {
  search: string;
  statusMode?: AssetRequestStatusMode;
  exactStatus?: AssetRequestStatus;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters asset requests in memory (status mode, employee, dates, search).
 */
export function filterAssetRequests(
  rows: AssetRequestListItem[],
  filters: AssetRequestListFilters,
): AssetRequestListItem[] {
  return rows.filter((row) => {
    if (filters.exactStatus) {
      if (row.status !== filters.exactStatus) {
        return false;
      }
    } else {
      const mode = filters.statusMode ?? 'all';
      if (mode !== 'all') {
        const statuses = statusesForAssetRequestMode(mode);
        if (statuses.length > 0 && !statuses.includes(row.status)) {
          return false;
        }
      }
    }

    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }

    if (filters.dateFrom) {
      const created = row.createdAt.slice(0, 10);
      if (created < filters.dateFrom) {
        return false;
      }
    }

    if (filters.dateTo) {
      const created = row.createdAt.slice(0, 10);
      if (created > filters.dateTo) {
        return false;
      }
    }

    return matchesAssetRequestSearch(row, filters.search);
  });
}
