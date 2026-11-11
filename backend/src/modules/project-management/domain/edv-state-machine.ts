import { EdvStatus } from './contracts/enums/edv-status.enum';

export type EdvTransitionRejectionCode =
  | 'INVALID_TRANSITION'
  | 'ACTIVE_DRAFT_EXISTS'
  | 'LOCKED_IMMUTABLE'
  | 'SUPERSEDED_IMMUTABLE';

export interface EdvTransitionResult {
  readonly allowed: boolean;
  readonly from: EdvStatus;
  readonly to: EdvStatus;
  readonly code?: EdvTransitionRejectionCode;
  readonly message?: string;
}

/** Explicit allowed transitions - linear lockstep v1. */
const ALLOWED_EDV_TRANSITIONS: Readonly<
  Record<EdvStatus, readonly EdvStatus[]>
> = {
  [EdvStatus.DRAFT]: [EdvStatus.IN_REVIEW, EdvStatus.SUPERSEDED],
  [EdvStatus.IN_REVIEW]: [
    EdvStatus.APPROVED,
    EdvStatus.DRAFT,
    EdvStatus.SUPERSEDED,
  ],
  [EdvStatus.APPROVED]: [
    EdvStatus.LOCKED,
    EdvStatus.IN_REVIEW,
    EdvStatus.SUPERSEDED,
  ],
  /** Unlock returns a locked revision to APPROVED for controlled rework. */
  [EdvStatus.LOCKED]: [EdvStatus.APPROVED],
  [EdvStatus.SUPERSEDED]: [],
};

const TERMINAL_STATUSES: ReadonlySet<EdvStatus> = new Set([
  EdvStatus.SUPERSEDED,
]);

/**
 * Returns allowed target statuses from the current EDV status.
 */
export function getAllowedEdvTransitions(
  from: EdvStatus,
): readonly EdvStatus[] {
  return ALLOWED_EDV_TRANSITIONS[from];
}

/**
 * Validates a single EDV status transition without side effects.
 */
export function canTransitionEdvStatus(
  from: EdvStatus,
  to: EdvStatus,
): EdvTransitionResult {
  if (from === to) {
    return {
      allowed: false,
      from,
      to,
      code: 'INVALID_TRANSITION',
      message: 'No-op transition',
    };
  }

  if (TERMINAL_STATUSES.has(from)) {
    return {
      allowed: false,
      from,
      to,
      code: 'SUPERSEDED_IMMUTABLE',
      message: `Cannot transition from ${from}`,
    };
  }

  const allowed = ALLOWED_EDV_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return {
      allowed: false,
      from,
      to,
      code: 'INVALID_TRANSITION',
      message: `Transition ${from} → ${to} is not permitted`,
    };
  }

  return { allowed: true, from, to };
}

/**
 * Applies a validated transition - throws if invalid.
 */
export function transitionEdvStatus(
  from: EdvStatus,
  to: EdvStatus,
): EdvStatus {
  const result = canTransitionEdvStatus(from, to);
  if (!result.allowed) {
    throw new Error(result.message ?? 'Invalid EDV transition');
  }
  return to;
}

export interface NewRevisionUploadInput {
  readonly existingEdvStatuses: readonly EdvStatus[];
}

export interface NewRevisionUploadResult {
  readonly allowed: boolean;
  readonly code?: EdvTransitionRejectionCode;
  readonly message?: string;
  readonly supersededStatuses: readonly EdvStatus[];
}

/**
 * Linear lockstep rules for creating a new EDV revision.
 * - Reject if any active DRAFT exists.
 * - Prior non-LOCKED versions become SUPERSEDED.
 */
export function validateNewRevisionUpload(
  input: NewRevisionUploadInput,
): NewRevisionUploadResult {
  const { existingEdvStatuses } = input;

  if (existingEdvStatuses.includes(EdvStatus.DRAFT)) {
    return {
      allowed: false,
      code: 'ACTIVE_DRAFT_EXISTS',
      message: 'Active revision already exists',
      supersededStatuses: [],
    };
  }

  const supersededStatuses = existingEdvStatuses.filter(
    (status) =>
      status !== EdvStatus.LOCKED && status !== EdvStatus.SUPERSEDED,
  );

  return {
    allowed: true,
    supersededStatuses,
  };
}

/**
 * EDV statuses that accept review comments (pre-lock).
 */
export function edvStatusAllowsComments(status: EdvStatus): boolean {
  return status === EdvStatus.IN_REVIEW || status === EdvStatus.APPROVED;
}
