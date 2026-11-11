import type {
  MaterialRequisitionListItem,
  MaterialRequisitionStatus,
} from '@/lib/api/material-requisition.types';
import { formatMaterialRequisitionEmployeeName } from '@/lib/utils/material-requisition-display';

export type MaterialRequisitionStatusMode =
  | 'all'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected';

export const DRAFT_STATUSES: MaterialRequisitionStatus[] = ['DRAFT'];
const PENDING_STATUSES: MaterialRequisitionStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: MaterialRequisitionStatus[] = ['APPROVED'];
const REJECTED_STATUSES: MaterialRequisitionStatus[] = ['REJECTED', 'CANCELLED'];

export function statusesForMaterialRequisitionMode(
  mode: MaterialRequisitionStatusMode,
): MaterialRequisitionStatus[] {
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
 * Client-side material requisition search by request #, title, warehouse, employee.
 */
export function matchesMaterialRequisitionSearch(
  row: MaterialRequisitionListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName =
    formatMaterialRequisitionEmployeeName(row.employee).toLowerCase();
  const email = (row.employee?.email ?? '').toLowerCase();
  const haystack = [
    row.requestNumber,
    row.title,
    row.purpose,
    row.warehouseLocation,
    row.id,
    row.employeeId,
    employeeName,
    email,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface MaterialRequisitionListFilters {
  search: string;
  statusMode?: MaterialRequisitionStatusMode;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters material requisitions in memory (status mode, employee, dates, search).
 */
export function filterMaterialRequisitions(
  rows: MaterialRequisitionListItem[],
  filters: MaterialRequisitionListFilters,
): MaterialRequisitionListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForMaterialRequisitionMode(mode);
      if (statuses.length > 0 && !statuses.includes(row.status)) {
        return false;
      }
    }

    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateKey = (row.submittedAt ?? row.createdAt ?? '').slice(0, 10);
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

    return matchesMaterialRequisitionSearch(row, filters.search);
  });
}
