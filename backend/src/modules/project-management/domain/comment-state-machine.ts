import { CommentStatus } from './contracts/enums/comment-status.enum';

export type CommentActorRole = 'designer' | 'reviewer' | 'system';

export type CommentTransitionRejectionCode =
  | 'INVALID_TRANSITION'
  | 'ACTOR_NOT_PERMITTED'
  | 'TERMINAL_STATUS';

export interface CommentTransitionResult {
  readonly allowed: boolean;
  readonly from: CommentStatus;
  readonly to: CommentStatus;
  readonly code?: CommentTransitionRejectionCode;
  readonly message?: string;
}

/** Explicit allowed transitions per actor. */
const COMMENT_TRANSITIONS: Readonly<
  Record<CommentStatus, readonly CommentStatus[]>
> = {
  [CommentStatus.OPEN]: [CommentStatus.ACKNOWLEDGED],
  [CommentStatus.ACKNOWLEDGED]: [CommentStatus.IN_PROGRESS],
  [CommentStatus.IN_PROGRESS]: [CommentStatus.RESOLVED],
  [CommentStatus.RESOLVED]: [CommentStatus.VERIFIED, CommentStatus.IN_PROGRESS],
  [CommentStatus.VERIFIED]: [CommentStatus.CLOSED],
  [CommentStatus.CLOSED]: [],
};

const ACTOR_ALLOWED_TARGETS: Readonly<
  Record<CommentActorRole, ReadonlySet<CommentStatus>>
> = {
  designer: new Set([
    CommentStatus.ACKNOWLEDGED,
    CommentStatus.IN_PROGRESS,
    CommentStatus.RESOLVED,
  ]),
  reviewer: new Set([
    CommentStatus.ACKNOWLEDGED,
    CommentStatus.IN_PROGRESS,
    CommentStatus.VERIFIED,
    CommentStatus.IN_PROGRESS,
  ]),
  system: new Set([CommentStatus.CLOSED]),
};

const TERMINAL_COMMENT_STATUSES: ReadonlySet<CommentStatus> = new Set([
  CommentStatus.CLOSED,
]);

const SESSION_CLOSEABLE_STATUSES: ReadonlySet<CommentStatus> = new Set([
  CommentStatus.VERIFIED,
  CommentStatus.CLOSED,
]);

const APPROVE_BLOCKING_STATUSES: ReadonlySet<CommentStatus> = new Set([
  CommentStatus.OPEN,
  CommentStatus.ACKNOWLEDGED,
  CommentStatus.IN_PROGRESS,
  CommentStatus.RESOLVED,
]);

export function getAllowedCommentTransitions(
  from: CommentStatus,
): readonly CommentStatus[] {
  return COMMENT_TRANSITIONS[from];
}

export function canTransitionCommentStatus(
  from: CommentStatus,
  to: CommentStatus,
  actor: CommentActorRole,
): CommentTransitionResult {
  if (from === to) {
    return {
      allowed: false,
      from,
      to,
      code: 'INVALID_TRANSITION',
      message: 'No-op transition',
    };
  }

  if (TERMINAL_COMMENT_STATUSES.has(from)) {
    return {
      allowed: false,
      from,
      to,
      code: 'TERMINAL_STATUS',
      message: `Cannot transition from ${from}`,
    };
  }

  if (!COMMENT_TRANSITIONS[from].includes(to)) {
    return {
      allowed: false,
      from,
      to,
      code: 'INVALID_TRANSITION',
      message: `Transition ${from} → ${to} is not permitted`,
    };
  }

  if (!ACTOR_ALLOWED_TARGETS[actor].has(to)) {
    return {
      allowed: false,
      from,
      to,
      code: 'ACTOR_NOT_PERMITTED',
      message: `Actor ${actor} cannot set status to ${to}`,
    };
  }

  if (to === CommentStatus.CLOSED && from !== CommentStatus.VERIFIED) {
    return {
      allowed: false,
      from,
      to,
      code: 'INVALID_TRANSITION',
      message: 'CLOSED only allowed after VERIFIED',
    };
  }

  return { allowed: true, from, to };
}

export function transitionCommentStatus(
  from: CommentStatus,
  to: CommentStatus,
  actor: CommentActorRole,
): CommentStatus {
  const result = canTransitionCommentStatus(from, to, actor);
  if (!result.allowed) {
    throw new Error(result.message ?? 'Invalid comment transition');
  }
  return to;
}

/** All comments must be VERIFIED or CLOSED before session close. */
export function canCloseReviewSession(
  commentStatuses: readonly CommentStatus[],
): boolean {
  return commentStatuses.every((s) => SESSION_CLOSEABLE_STATUSES.has(s));
}

/** Approve blocked while any comment is not VERIFIED/CLOSED. */
export function canApprovePackage(
  commentStatuses: readonly CommentStatus[],
): boolean {
  return !commentStatuses.some((s) => APPROVE_BLOCKING_STATUSES.has(s));
}
