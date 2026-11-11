import type {
  PurchaseRequestListItem,
  PurchaseRequestStatus,
} from '@/lib/api/purchase-request.types';
import { formatPurchaseRequestEmployeeName } from '@/lib/utils/purchase-request-display';

export type PurchaseRequestStatusMode =
  | 'all'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected';

export const DRAFT_STATUSES: PurchaseRequestStatus[] = ['DRAFT'];
const PENDING_STATUSES: PurchaseRequestStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: PurchaseRequestStatus[] = ['APPROVED'];
const REJECTED_STATUSES: PurchaseRequestStatus[] = ['REJECTED', 'CANCELLED'];

export function statusesForPurchaseRequestMode(
  mode: PurchaseRequestStatusMode,
): PurchaseRequestStatus[] {
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
 * Client-side purchase request search by request #, title, vendor, employee.
 */
export function matchesPurchaseRequestSearch(
  row: PurchaseRequestListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName = formatPurchaseRequestEmployeeName(row.employee).toLowerCase();
  const email = (row.employee?.email ?? '').toLowerCase();
  const haystack = [
    row.requestNumber,
    row.title,
    row.vendorName,
    row.id,
    row.employeeId,
    employeeName,
    email,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface PurchaseRequestListFilters {
  search: string;
  statusMode?: PurchaseRequestStatusMode;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
}

/**
 * Filters purchase requests in memory (status mode, employee, dates, amounts, search).
 */
export function filterPurchaseRequests(
  rows: PurchaseRequestListItem[],
  filters: PurchaseRequestListFilters,
): PurchaseRequestListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForPurchaseRequestMode(mode);
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

    const amount = Number(row.totalEstimatedEtb);
    if (
      filters.amountMin !== undefined &&
      !Number.isNaN(amount) &&
      amount < filters.amountMin
    ) {
      return false;
    }
    if (
      filters.amountMax !== undefined &&
      !Number.isNaN(amount) &&
      amount > filters.amountMax
    ) {
      return false;
    }

    return matchesPurchaseRequestSearch(row, filters.search);
  });
}
