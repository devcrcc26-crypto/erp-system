import type { ApprovalRequestStatus } from '@/lib/api/approvals.types';

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
