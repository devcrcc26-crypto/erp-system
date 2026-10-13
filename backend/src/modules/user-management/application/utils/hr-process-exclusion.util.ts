import { BadRequestException } from '@nestjs/common';

export interface HrProcessExclusionState {
  excludedFromHrProcesses: boolean;
  excludedReason: string | null;
}

/**
 * Next approver-only state for PATCH /users/:id, or null when unchanged.
 *
 * - Including the account again (flag off) clears the reason.
 * - A reason is kept only while excluded; sending one for an included account
 *   (without also excluding it) is rejected.
 */
export function resolveHrProcessExclusionUpdate(
  current: HrProcessExclusionState,
  input: {
    excludedFromHrProcesses?: boolean;
    excludedReason?: string | null;
  },
): HrProcessExclusionState | null {
  if (
    input.excludedFromHrProcesses === undefined &&
    input.excludedReason === undefined
  ) {
    return null;
  }

  const excluded = input.excludedFromHrProcesses ?? current.excludedFromHrProcesses;
  const requestedReason =
    input.excludedReason === undefined
      ? current.excludedReason
      : input.excludedReason?.trim() || null;

  if (!excluded && input.excludedReason?.trim()) {
    throw new BadRequestException(
      'excludedReason can only be set on an approver-only account',
    );
  }

  const next: HrProcessExclusionState = {
    excludedFromHrProcesses: excluded,
    excludedReason: excluded ? requestedReason : null,
  };

  if (
    next.excludedFromHrProcesses === current.excludedFromHrProcesses &&
    next.excludedReason === current.excludedReason
  ) {
    return null;
  }
  return next;
}
