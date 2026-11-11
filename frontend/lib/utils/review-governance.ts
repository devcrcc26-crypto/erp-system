import type { ReviewTier } from '@/lib/api/epc.types';
import type { PackageRoleLens } from '@/lib/hooks/use-package-role-lens';
import type { DisciplineRoleFields } from '@/lib/utils/subtask-role-resolver';
import { isExternalInstituteChief } from '@/lib/utils/institute-chief';
import {
  resolveTierActorUserId,
  REVIEW_TIER_ORDER,
} from '@/lib/utils/review-tier-display';

/**
 * Final governance tier for THIS package - the last tier, in canonical
 * REVIEW_TIER_ORDER, among the package's own requiredTiers. Not a fixed
 * tier: a package that doesn't require INSTITUTE_CHIEF finalizes at
 * DEPT_CHIEF, one that does finalizes at INSTITUTE_CHIEF.
 */
export function isFinalReviewTier(
  tier: ReviewTier | string | null | undefined,
  requiredTiers?: ReadonlyArray<ReviewTier | string> | null,
): boolean {
  if (!tier) {
    return false;
  }
  if (!requiredTiers || requiredTiers.length === 0) {
    // No package context available - fall back to the pre-INSTITUTE_CHIEF
    // default rather than silently treating every tier as non-final.
    return tier === 'DEPT_CHIEF';
  }
  const tierIndex = REVIEW_TIER_ORDER.indexOf(tier as ReviewTier);
  if (tierIndex < 0) {
    return false;
  }
  return !requiredTiers.some(
    (required) => REVIEW_TIER_ORDER.indexOf(required as ReviewTier) > tierIndex,
  );
}

/**
 * Label for the session-level approve action at the current tier.
 */
export function getSessionApproveLabel(
  tier: ReviewTier | string | null | undefined,
  requiredTiers?: ReadonlyArray<ReviewTier | string> | null,
): string {
  return isFinalReviewTier(tier, requiredTiers) ? 'Approve subtask' : 'Approve & escalate';
}

/**
 * EDV batch approval is only valid at the final governance tier.
 */
export function canBatchApprovePackageEdvs(
  tier: ReviewTier | string | null | undefined,
  requiredTiers: ReadonlyArray<ReviewTier | string> | null | undefined,
  inReviewEdvCount: number,
): boolean {
  return isFinalReviewTier(tier, requiredTiers) && inReviewEdvCount > 0;
}

/** Tiers where session-level approve/return actions are available. */
export function isGovernanceReviewTier(
  tier: ReviewTier | string | null | undefined,
): boolean {
  return (
    tier === 'DISCIPLINE_OWNER' ||
    tier === 'REVIEWER' ||
    tier === 'DISCIPLINE_LEAD' ||
    tier === 'DEPT_CHIEF' ||
    tier === 'INSTITUTE_CHIEF'
  );
}

/**
 * True when the signed-in user may approve or return at the session's current tier.
 */
export function canUserActAtCurrentReviewTier(
  packageLens: PackageRoleLens,
  discipline: DisciplineRoleFields | null | undefined,
  currentUserId: string | null | undefined,
  currentTier: ReviewTier | string | null | undefined,
  instituteChiefUserId: string | null,
  instituteChiefName: string | null | undefined,
  canApproveReview: boolean,
): boolean {
  if (!currentTier || !currentUserId) {
    return false;
  }
  if (packageLens.canApproveAtTier || packageLens.canApproveOnBehalf) {
    return true;
  }
  if (
    currentTier === 'INSTITUTE_CHIEF' &&
    isExternalInstituteChief({
      instituteChiefUserId,
      instituteChiefName,
    }) &&
    canApproveReview
  ) {
    return true;
  }
  if (!discipline) {
    return false;
  }
  return resolveTierActorUserId(discipline, currentTier) === currentUserId;
}
