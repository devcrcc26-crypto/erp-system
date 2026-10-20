import type {
  PerDiemRequestListItem,
  PerDiemStatus,
} from '@/lib/api/per-diem.types';
import { formatPerDiemEmployeeName } from '@/lib/utils/per-diem-display';

export type PerDiemStatusMode =
  | 'all'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected';

export const DRAFT_STATUSES: PerDiemStatus[] = ['DRAFT'];
const PENDING_STATUSES: PerDiemStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: PerDiemStatus[] = ['APPROVED'];
const REJECTED_STATUSES: PerDiemStatus[] = ['REJECTED', 'CANCELLED'];

export function statusesForPerDiemMode(
  mode: PerDiemStatusMode,
): PerDiemStatus[] {
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
 * Client-side per diem search by #, destination, category, or employee.
 */
export function matchesPerDiemSearch(
  row: PerDiemRequestListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName = formatPerDiemEmployeeName(row.employee).toLowerCase();
  const email = (row.employee?.email ?? '').toLowerCase();
  const haystack = [
    row.requestNumber,
    row.id,
    row.employeeId,
    row.destination,
    row.destinationCategory,
    employeeName,
    email,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

function startDateInRange(
  startDate: string,
  dateFrom?: string,
  dateTo?: string,
): boolean {
  if (!dateFrom && !dateTo) {
    return true;
  }
  const day = startDate.slice(0, 10);
  if (dateFrom && day < dateFrom) {
    return false;
  }
  if (dateTo && day > dateTo) {
    return false;
  }
  return true;
}

export interface PerDiemListFilters {
  search: string;
  statusMode?: PerDiemStatusMode;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters per diem requests in memory (status, employee, dates, search).
 */
export function filterPerDiemRequests(
  rows: PerDiemRequestListItem[],
  filters: PerDiemListFilters,
): PerDiemRequestListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForPerDiemMode(mode);
      if (statuses.length > 0 && !statuses.includes(row.status)) {
        return false;
      }
    }

    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }

    if (!startDateInRange(row.startDate, filters.dateFrom, filters.dateTo)) {
      return false;
    }

    return matchesPerDiemSearch(row, filters.search);
  });
}
