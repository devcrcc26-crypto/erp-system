import type { ReviewTier } from '@/lib/api/epc.types';

/**
 * Final governance tier — only here may EDVs be batch-approved to APPROVED.
 */
export function isFinalReviewTier(
  tier: ReviewTier | string | null | undefined,
): boolean {
  return tier === 'DEPT_CHIEF';
}

/**
 * Label for the session-level approve action at the current tier.
 */
export function getSessionApproveLabel(
  tier: ReviewTier | string | null | undefined,
): string {
  return isFinalReviewTier(tier) ? 'Approve package' : 'Approve & escalate';
}

/**
 * EDV batch approval is only valid at the final governance tier.
 */
export function canBatchApprovePackageEdvs(
  tier: ReviewTier | string | null | undefined,
  inReviewEdvCount: number,
): boolean {
  return isFinalReviewTier(tier) && inReviewEdvCount > 0;
}
