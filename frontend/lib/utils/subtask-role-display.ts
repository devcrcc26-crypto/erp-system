import type { ReviewTier, SubtaskRole } from '@/lib/api/epc.types';
import { reviewTierBilingualLabel } from '@/lib/utils/review-tier-display';

const SUBTASK_ROLE_LABELS: Record<SubtaskRole, string> = {
  DESIGNER: 'Designer',
  SUPPORTING_DESIGNER: 'Supporting Designer',
  REVIEWER: 'Reviewer',
  DISCIPLINE_LEAD: 'Discipline Leader',
  DEPT_CHIEF: 'Dept Chief',
  INSTITUTE_CHIEF: 'Institute Chief',
  DISCIPLINE_OWNER: 'Discipline Owner',
};

/**
 * Short English label for a package/discipline assignment role.
 */
export function subtaskRoleLabel(role: SubtaskRole | ReviewTier | string): string {
  if (role in SUBTASK_ROLE_LABELS) {
    return SUBTASK_ROLE_LABELS[role as SubtaskRole];
  }
  return reviewTierBilingualLabel(role);
}

/**
 * Display text for the page "Acting as" badge.
 */
export function formatActingAsLabel(
  primaryRole: SubtaskRole | null,
  secondaryReviewRole: ReviewTier | null,
  fallback?: string | null,
): string | null {
  if (primaryRole) {
    const primary = subtaskRoleLabel(primaryRole);
    if (
      secondaryReviewRole &&
      (primaryRole === 'DESIGNER' || primaryRole === 'SUPPORTING_DESIGNER')
    ) {
      return `${primary} + ${subtaskRoleLabel(secondaryReviewRole)}`;
    }
    return primary;
  }
  return fallback?.trim() || null;
}
