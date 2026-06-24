import type { CommentStatus } from '@/lib/api/epc.types';

const APPROVE_BLOCKING_STATUSES: ReadonlySet<CommentStatus> = new Set([
  'OPEN',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'RESOLVED',
]);

/**
 * Mirrors backend `canApprovePackage` - all comments must be VERIFIED or CLOSED.
 */
export function canApproveReviewSession(
  commentStatuses: readonly CommentStatus[],
): boolean {
  return !commentStatuses.some((status) => APPROVE_BLOCKING_STATUSES.has(status));
}

export function isCommentBlockingApproval(status: CommentStatus): boolean {
  return APPROVE_BLOCKING_STATUSES.has(status);
}

export function getCommentsBlockingApproval<T extends { status: CommentStatus }>(
  comments: readonly T[],
): T[] {
  return comments.filter((comment) => isCommentBlockingApproval(comment.status));
}

export const APPROVAL_BLOCKED_MESSAGE =
  'All comments must be VERIFIED or CLOSED before approval.';
