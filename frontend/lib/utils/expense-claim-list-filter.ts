import type {
  ExpenseClaimListItem,
  ExpenseClaimStatus,
} from '@/lib/api/expense-claim.types';
import { formatExpenseClaimEmployeeName } from '@/lib/utils/expense-claim-display';

export type ExpenseClaimStatusMode = 'all' | 'draft' | 'pending' | 'approved' | 'rejected';

const DRAFT_STATUSES: ExpenseClaimStatus[] = ['DRAFT', 'RETURNED'];
const PENDING_STATUSES: ExpenseClaimStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
];
const APPROVED_STATUSES: ExpenseClaimStatus[] = ['APPROVED'];
const REJECTED_STATUSES: ExpenseClaimStatus[] = ['REJECTED', 'CANCELLED'];

export function statusesForExpenseClaimMode(
  mode: ExpenseClaimStatusMode,
): ExpenseClaimStatus[] {
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
 * Client-side expense claim search by claim #, title, employee, or ids.
 */
export function matchesExpenseClaimSearch(
  row: ExpenseClaimListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName = formatExpenseClaimEmployeeName(row.employee).toLowerCase();
  const email = (row.employee?.email ?? '').toLowerCase();
  const haystack = [
    row.claimNumber,
    row.title,
    row.id,
    row.employeeId,
    employeeName,
    email,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface ExpenseClaimListFilters {
  search: string;
  statusMode?: ExpenseClaimStatusMode;
  employeeId?: string;
}

/**
 * Filters expense claims in memory (status mode, employee, search).
 */
export function filterExpenseClaims(
  rows: ExpenseClaimListItem[],
  filters: ExpenseClaimListFilters,
): ExpenseClaimListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForExpenseClaimMode(mode);
      if (statuses.length > 0 && !statuses.includes(row.status)) {
        return false;
      }
    }

    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }

    return matchesExpenseClaimSearch(row, filters.search);
  });
}
