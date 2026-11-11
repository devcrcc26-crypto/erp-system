import { ReviewTier } from '@prisma/client';
import { REVIEW_TIER_ORDER } from './contracts/enums/review-tier.enum';

export function computeRequiredTiers(
  discipline: {
    designerUserId: string | null;
    supportingDesignerUserId: string | null;
    ownerUserId: string | null;
    reviewerUserId: string | null;
    disciplineLeadUserId: string | null;
    chiefUserId: string | null;
    instituteChiefUserId: string | null;
  },
  instituteChiefName?: string | null,
): ReviewTier[] {
  // DISCIPLINE_OWNER is intentionally never included - disciplineOwnerUserId
  // stays on DesignPackage/TaskDiscipline but is no longer an approval step.
  const included = new Set<string>([
    ReviewTier.REVIEWER,
    ReviewTier.DISCIPLINE_LEAD,
    ReviewTier.DEPT_CHIEF,
    ReviewTier.INSTITUTE_CHIEF,
  ]);

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

  if (!discipline.instituteChiefUserId && !instituteChiefName) {
    included.delete(ReviewTier.INSTITUTE_CHIEF);
  }

  // DISCIPLINE_LEAD is never removed - always in the result
  return REVIEW_TIER_ORDER.filter((t) => included.has(t)) as ReviewTier[];
}
