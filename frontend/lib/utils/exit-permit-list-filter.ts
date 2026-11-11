import type {
  ExitPermitListItem,
  ExitPermitStatus,
} from '@/lib/api/exit-permit.types';
import {
  formatExitPermitDepartmentName,
  formatExitPermitEmployeeName,
} from '@/lib/utils/exit-permit-display';

export type ExitPermitStatusMode =
  | 'all'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected';

export const DRAFT_STATUSES: ExitPermitStatus[] = ['DRAFT'];
const PENDING_STATUSES: ExitPermitStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: ExitPermitStatus[] = ['APPROVED'];
const REJECTED_STATUSES: ExitPermitStatus[] = ['REJECTED', 'CANCELLED'];

export function statusesForExitPermitMode(
  mode: ExitPermitStatusMode,
): ExitPermitStatus[] {
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
 * Client-side exit permit search by #, employee, department, direction.
 */
export function matchesExitPermitSearch(
  row: ExitPermitListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName = formatExitPermitEmployeeName(row.employee).toLowerCase();
  const submitterName = formatExitPermitEmployeeName(
    row.submitter ?? row.creator,
  ).toLowerCase();
  const departmentName = formatExitPermitDepartmentName(
    row.department,
  ).toLowerCase();
  const haystack = [
    row.requestNumber,
    row.id,
    row.employeeId,
    row.direction,
    employeeName,
    submitterName,
    departmentName,
    row.employee?.email,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface ExitPermitListFilters {
  search: string;
  statusMode?: ExitPermitStatusMode;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters exit permits in memory.
 */
export function filterExitPermits(
  rows: ExitPermitListItem[],
  filters: ExitPermitListFilters,
): ExitPermitListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForExitPermitMode(mode);
      if (statuses.length > 0 && !statuses.includes(row.status)) {
        return false;
      }
    }

    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateKey = (row.date ?? row.createdAt ?? '').slice(0, 10);
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

    return matchesExitPermitSearch(row, filters.search);
  });
}
