import { ReviewTier } from '@prisma/client';
import { EffectiveApprovalChain } from './approval-chain.util';

export type SubtaskRole =
  | 'DESIGNER'
  | 'SUPPORTING_DESIGNER'
  | 'REVIEWER'
  | 'DISCIPLINE_LEAD'
  | 'DEPT_CHIEF'
  | 'INSTITUTE_CHIEF'
  | 'DISCIPLINE_OWNER';

export interface ResolvedSubtaskRoles {
  primaryRole: SubtaskRole | null;
  secondaryReviewRole: ReviewTier | null;
}

/**
 * Highest reviewer-tier role the user holds on the effective chain, or null.
 * Precedence: REVIEWER > DISCIPLINE_LEAD > DEPT_CHIEF > INSTITUTE_CHIEF.
 */
function resolveReviewerTier(
  chain: EffectiveApprovalChain,
  userId: string,
): ReviewTier | null {
  if (chain.reviewerUserId === userId) {
    return ReviewTier.REVIEWER;
  }
  if (chain.disciplineLeadUserId === userId) {
    return ReviewTier.DISCIPLINE_LEAD;
  }
  if (chain.chiefUserId === userId) {
    return ReviewTier.DEPT_CHIEF;
  }
  if (chain.instituteChiefUserId === userId) {
    return ReviewTier.INSTITUTE_CHIEF;
  }
  return null;
}

/**
 * Resolves a user's primary routing role and secondary review-tier role on a
 * subtask, from its effective approval chain (package FK, else discipline
 * default). Precedence: DESIGNER > SUPPORTING_DESIGNER > REVIEWER >
 * DISCIPLINE_LEAD > DEPT_CHIEF > INSTITUTE_CHIEF > DISCIPLINE_OWNER.
 *
 * secondaryReviewRole is only populated when primaryRole is DESIGNER or
 * SUPPORTING_DESIGNER and the same user also holds one of the four
 * reviewer-tier roles (DISCIPLINE_OWNER never counts as a secondary role).
 */
export function resolveSubtaskRoles(
  chain: EffectiveApprovalChain,
  userId: string,
): ResolvedSubtaskRoles {
  if (chain.designerUserId === userId) {
    return {
      primaryRole: 'DESIGNER',
      secondaryReviewRole: resolveReviewerTier(chain, userId),
    };
  }
  if (chain.supportingDesignerUserId === userId) {
    return {
      primaryRole: 'SUPPORTING_DESIGNER',
      secondaryReviewRole: resolveReviewerTier(chain, userId),
    };
  }

  const reviewerTier = resolveReviewerTier(chain, userId);
  if (reviewerTier) {
    return { primaryRole: reviewerTier, secondaryReviewRole: null };
  }

  if (chain.ownerUserId === userId) {
    return { primaryRole: 'DISCIPLINE_OWNER', secondaryReviewRole: null };
  }

  return { primaryRole: null, secondaryReviewRole: null };
}
