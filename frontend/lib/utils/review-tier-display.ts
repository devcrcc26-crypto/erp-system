// Gap completion — new

import type { ReviewTier } from '@/lib/api/project-management.types';
import { tokens } from '@/lib/theme/tokens';

export function reviewTierLabel(tier: ReviewTier): string {
  const labels: Record<ReviewTier, string> = {
    DISCIPLINE_OWNER: 'Discipline owner',
    REVIEWER: 'Reviewer',
    DISCIPLINE_LEAD: 'Discipline lead',
    DEPT_CHIEF: 'Dept chief',
  };
  return labels[tier] ?? tier;
}

export function reviewTierColors(tier: ReviewTier): {
  bg: string;
  text: string;
} {
  const map: Record<ReviewTier, { bg: string; text: string }> = {
    DISCIPLINE_OWNER: {
      bg: tokens.colorTeal50,
      text: tokens.colorTeal600,
    },
    REVIEWER: { bg: tokens.colorBlue50, text: tokens.colorBlue400 },
    DISCIPLINE_LEAD: {
      bg: tokens.colorAmber50,
      text: tokens.colorAmber400,
    },
    DEPT_CHIEF: { bg: tokens.colorCoral50, text: tokens.colorCoral400 },
  };
  return map[tier] ?? { bg: tokens.colorGray50, text: tokens.colorGray600 };
}
