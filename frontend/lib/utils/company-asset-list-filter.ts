import type {
  AssetStatus,
  CompanyAssetListItem,
} from '@/lib/api/company-asset.types';
import { formatUserName } from '@/lib/utils/user-display';

export type CompanyAssetStatusMode = 'all' | AssetStatus;

/**
 * Client-side company asset search by serial, brand, model, type, assignee.
 */
export function matchesCompanyAssetSearch(
  row: CompanyAssetListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const assignee = row.assignedTo ? formatUserName(row.assignedTo) : '';
  const haystack = [
    row.serialNumber,
    row.assetCode,
    row.brand,
    row.model,
    row.type,
    row.color,
    row.assetCategory,
    row.assetName,
    row.id,
    assignee,
    row.assignedTo?.email,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface CompanyAssetListFilters {
  search: string;
  statusMode?: CompanyAssetStatusMode;
  type?: string;
}

/**
 * Filters company assets in memory.
 */
export function filterCompanyAssets(
  rows: CompanyAssetListItem[],
  filters: CompanyAssetListFilters,
): CompanyAssetListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all' && row.status !== mode) {
      return false;
    }

    if (filters.type && row.type !== filters.type) {
      return false;
    }

    return matchesCompanyAssetSearch(row, filters.search);
  });
}
