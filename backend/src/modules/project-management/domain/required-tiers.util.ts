import { ReviewTier } from '@prisma/client';
import { REVIEW_TIER_ORDER } from './contracts/enums/review-tier.enum';

export function computeRequiredTiers(discipline: {
  designerUserId: string | null;
  supportingDesignerUserId: string | null;
  ownerUserId: string | null;
  reviewerUserId: string | null;
  disciplineLeadUserId: string | null;
  chiefUserId: string | null;
  instituteChiefUserId: string | null;
}): ReviewTier[] {
  const included = new Set<string>([
    ReviewTier.DISCIPLINE_OWNER,
    ReviewTier.REVIEWER,
    ReviewTier.DISCIPLINE_LEAD,
    ReviewTier.DEPT_CHIEF,
    ReviewTier.INSTITUTE_CHIEF,
  ]);

  if (
    !discipline.ownerUserId ||
    discipline.ownerUserId === discipline.designerUserId
  ) {
    included.delete(ReviewTier.DISCIPLINE_OWNER);
  }

  if (
    !discipline.reviewerUserId ||
    discipline.reviewerUserId === discipline.designerUserId ||
    discipline.reviewerUserId === discipline.ownerUserId
  ) {
    included.delete(ReviewTier.REVIEWER);
  }

  if (
    !discipline.chiefUserId ||
    discipline.chiefUserId === discipline.disciplineLeadUserId ||
    discipline.chiefUserId === discipline.instituteChiefUserId
  ) {
    included.delete(ReviewTier.DEPT_CHIEF);
  }

  if (!discipline.instituteChiefUserId) {
    included.delete(ReviewTier.INSTITUTE_CHIEF);
  }

  // DISCIPLINE_LEAD is never removed — always in the result
  return REVIEW_TIER_ORDER.filter((t) => included.has(t)) as ReviewTier[];
}
