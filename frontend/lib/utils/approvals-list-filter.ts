import type {
  ApprovalRequestListItem,
  ApprovalRequestStatus,
} from '@/lib/api/approvals.types';
import { formatApprovalUserName } from '@/lib/utils/approval-display';

export type ApprovalStatusMode = 'all' | 'pending' | 'approved' | 'rejected';

const PENDING_STATUSES: ApprovalRequestStatus[] = [
  'PENDING',
  'IN_REVIEW',
  'SUBMITTED',
  'RETURNED',
  'DRAFT',
];
const APPROVED_STATUSES: ApprovalRequestStatus[] = ['APPROVED'];
const REJECTED_STATUSES: ApprovalRequestStatus[] = ['REJECTED', 'CANCELLED'];

/**
 * Status buckets for approvals inbox stats / filters.
 */
export function statusesForApprovalMode(
  mode: ApprovalStatusMode,
): ApprovalRequestStatus[] {
  switch (mode) {
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
 * Client-side approval search by #, title, category, or requester.
 */
export function matchesApprovalSearch(
  row: ApprovalRequestListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const haystack = [
    row.requestNumber,
    row.id,
    row.title,
    row.category?.name,
    row.category?.code,
    row.categoryCode,
    formatApprovalUserName(row.requester),
    row.requester?.email,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface ApprovalListFilters {
  search: string;
  statusMode?: ApprovalStatusMode;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters approval requests in memory (search, status, category, dates).
 */
export function filterApprovalRequests(
  rows: ApprovalRequestListItem[],
  filters: ApprovalListFilters,
): ApprovalRequestListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForApprovalMode(mode);
      if (statuses.length > 0 && !statuses.includes(row.status)) {
        return false;
      }
    }

    if (filters.categoryId && row.categoryId !== filters.categoryId) {
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

    return matchesApprovalSearch(row, filters.search);
  });
}

/**
 * Cancelled requests are hidden from the approval chain: never in "Pending My
 * Action", and elsewhere only for the requester (their history) or full-access
 * HR / admins. The API applies the same rule; this keeps cached lists honest.
 */
export function hideCancelledFromApprovers(
  rows: ApprovalRequestListItem[],
  options: {
    inbox: 'PENDING_MY_ACTION' | 'MY_REQUESTS' | 'ALL';
    currentUserId: string;
    isFullAccess: boolean;
  },
): ApprovalRequestListItem[] {
  return rows.filter((row) => {
    if (row.status !== 'CANCELLED') {
      return true;
    }
    if (options.inbox === 'PENDING_MY_ACTION') {
      return false;
    }
    return options.isFullAccess || row.requestedBy === options.currentUserId;
  });
}
