import type {
  ConsumablesRequisitionListItem,
  ConsumablesRequisitionStatus,
} from '@/lib/api/consumables-requisition.types';
import { formatConsumablesRequisitionEmployeeName } from '@/lib/utils/consumables-requisition-display';

export type ConsumablesRequisitionStatusMode =
  | 'all'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected';

export const DRAFT_STATUSES: ConsumablesRequisitionStatus[] = ['DRAFT'];
const PENDING_STATUSES: ConsumablesRequisitionStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: ConsumablesRequisitionStatus[] = ['APPROVED'];
const REJECTED_STATUSES: ConsumablesRequisitionStatus[] = [
  'REJECTED',
  'CANCELLED',
];

export function statusesForConsumablesRequisitionMode(
  mode: ConsumablesRequisitionStatusMode,
): ConsumablesRequisitionStatus[] {
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
 * Client-side consumables search by request #, title, department, employee.
 */
export function matchesConsumablesRequisitionSearch(
  row: ConsumablesRequisitionListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName =
    formatConsumablesRequisitionEmployeeName(row.employee).toLowerCase();
  const email = (row.employee?.email ?? '').toLowerCase();
  const haystack = [
    row.requestNumber,
    row.title,
    row.purpose,
    row.department,
    row.id,
    row.employeeId,
    employeeName,
    email,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface ConsumablesRequisitionListFilters {
  search: string;
  statusMode?: ConsumablesRequisitionStatusMode;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters consumables requisitions in memory.
 */
export function filterConsumablesRequisitions(
  rows: ConsumablesRequisitionListItem[],
  filters: ConsumablesRequisitionListFilters,
): ConsumablesRequisitionListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForConsumablesRequisitionMode(mode);
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

    return matchesConsumablesRequisitionSearch(row, filters.search);
  });
}
