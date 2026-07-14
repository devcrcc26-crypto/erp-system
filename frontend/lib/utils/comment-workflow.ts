import type { CommentStatus } from '@/lib/api/epc.types';
import { isExternalInstituteChief } from './institute-chief';

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

/**
 * Default assignee for a new review comment/return-for-rework row: the package designer,
 * except at the INSTITUTE_CHIEF tier with an external (no-account) chief, where responsibility
 * falls back through the internal approval chain.
 */
export function resolveDefaultCommentAssignee(
  pkg:
    | {
        designerUserId?: string | null;
        deptDeputyChiefUserId?: string | null;
        disciplinaryLeaderUserId?: string | null;
        instituteChiefUserId?: string | null;
        instituteChiefName?: string | null;
      }
    | undefined,
  currentTier: string | null | undefined,
): string | undefined {
  if (!pkg) {
    return undefined;
  }

  if (
    currentTier === 'INSTITUTE_CHIEF' &&
    isExternalInstituteChief({
      instituteChiefUserId: pkg.instituteChiefUserId ?? null,
      instituteChiefName: pkg.instituteChiefName,
    })
  ) {
    return (
      pkg.deptDeputyChiefUserId ??
      pkg.disciplinaryLeaderUserId ??
      pkg.designerUserId ??
      undefined
    );
  }

  return pkg.designerUserId ?? undefined;
}
