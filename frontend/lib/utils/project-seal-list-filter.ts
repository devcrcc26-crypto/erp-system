import type {
  ProjectSealListItem,
  ProjectSealStatus,
} from '@/lib/api/project-seal.types';
import { formatProjectSealEmployeeName } from '@/lib/utils/project-seal';

export type ProjectSealStatusMode =
  | 'all'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected';

export const DRAFT_STATUSES: ProjectSealStatus[] = ['DRAFT'];
const PENDING_STATUSES: ProjectSealStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: ProjectSealStatus[] = ['APPROVED', 'SEAL_ISSUED'];
const REJECTED_STATUSES: ProjectSealStatus[] = ['REJECTED', 'CANCELLED'];

export function statusesForProjectSealMode(
  mode: ProjectSealStatusMode,
): ProjectSealStatus[] {
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
 * Client-side project seal search by #, file name, employee, description.
 */
export function matchesProjectSealSearch(
  row: ProjectSealListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName = formatProjectSealEmployeeName(row.employee).toLowerCase();
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

export interface ProjectSealListFilters {
  search: string;
  statusMode?: ProjectSealStatusMode;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters project seal requests in memory.
 */
export function filterProjectSeals(
  rows: ProjectSealListItem[],
  filters: ProjectSealListFilters,
): ProjectSealListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForProjectSealMode(mode);
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

    return matchesProjectSealSearch(row, filters.search);
  });
}
