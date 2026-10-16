import type { CommentStatus } from '@/lib/api/epc.types';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import { isExternalInstituteChief } from './institute-chief';

export const APPROVE_BLOCKING_STATUSES: ReadonlySet<CommentStatus> = new Set([
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

/**
 * Display label for the return/comment default assignee using discipline
 * name fields already loaded in review mode (avoids GET /users/:id which
 * requires users.view - unavailable to most approval-tier roles).
 */
export function resolveDefaultCommentAssigneeLabel(
  assigneeId: string | undefined,
  discipline: TaskDiscipline | null | undefined,
): string {
  if (!assigneeId) {
    return 'No designer assigned on this subtask';
  }
  if (!discipline) {
    return 'Designer';
  }

  if (discipline.designerUserId === assigneeId && discipline.designerName?.trim()) {
    return discipline.designerName.trim();
  }
  if (
    discipline.disciplineLeadUserId === assigneeId &&
    discipline.disciplinaryLeader?.trim()
  ) {
    return discipline.disciplinaryLeader.trim();
  }
  if (
    discipline.chiefUserId === assigneeId &&
    discipline.deptChiefEngineer?.trim()
  ) {
    return discipline.deptChiefEngineer.trim();
  }
  if (discipline.reviewerUserId === assigneeId && discipline.reviewerName?.trim()) {
    return discipline.reviewerName.trim();
  }
  if (
    discipline.ownerUserId === assigneeId &&
    discipline.disciplineOwnerName?.trim()
  ) {
    return discipline.disciplineOwnerName.trim();
  }
  if (
    discipline.supportingDesignerUserId === assigneeId &&
    discipline.supportingDesigner?.name?.trim()
  ) {
    return discipline.supportingDesigner.name.trim();
  }
  if (
    discipline.instituteChiefUserId === assigneeId &&
    discipline.instituteChief?.name?.trim()
  ) {
    return discipline.instituteChief.name.trim();
  }

  return 'Designer';
}
