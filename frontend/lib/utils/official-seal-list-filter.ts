import type {
  OfficialSealListItem,
  OfficialSealStatus,
} from '@/lib/api/official-seal.types';
import { formatOfficialSealEmployeeName } from '@/lib/utils/official-seal';

export type OfficialSealStatusMode =
  | 'all'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected';

export const DRAFT_STATUSES: OfficialSealStatus[] = ['DRAFT'];
const PENDING_STATUSES: OfficialSealStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: OfficialSealStatus[] = ['APPROVED', 'SEAL_ISSUED'];
const REJECTED_STATUSES: OfficialSealStatus[] = ['REJECTED', 'CANCELLED'];

export function statusesForOfficialSealMode(
  mode: OfficialSealStatusMode,
): OfficialSealStatus[] {
  switch (mode) {
    case 'draft':
      return DRAFT_STATUSES;
    case 'pending':
      return PENDING_STATUSES;
    case 'approved':
      return APPROVED_STATUSES;
    case 'rejected':
      return REJECTED_STATUSES;
    default:
      return [];
  }
}

/**
 * Client-side official seal search by #, file name, employee, description.
 */
export function matchesOfficialSealSearch(
  row: OfficialSealListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName = formatOfficialSealEmployeeName(row.employee).toLowerCase();
  const haystack = [
    row.requestNumber,
    row.id,
    row.employeeId,
    row.fileName,
    row.description,
    row.sealCategory,
    employeeName,
    row.employee?.email,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface OfficialSealListFilters {
  search: string;
  statusMode?: OfficialSealStatusMode;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters official seal requests in memory.
 */
export function filterOfficialSeals(
  rows: OfficialSealListItem[],
  filters: OfficialSealListFilters,
): OfficialSealListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForOfficialSealMode(mode);
      if (statuses.length > 0 && !statuses.includes(row.status)) {
        return false;
      }
    }

    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateKey = (row.dateNeeded ?? row.createdAt ?? '').slice(0, 10);
      if (!dateKey) {
        return false;
      }
      if (filters.dateFrom && dateKey < filters.dateFrom) {
        return false;
      }
      if (filters.dateTo && dateKey > filters.dateTo) {
        return false;
      }
    }

    return matchesOfficialSealSearch(row, filters.search);
  });
}
