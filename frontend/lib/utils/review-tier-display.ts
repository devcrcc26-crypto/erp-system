// Gap completion - new

import type {
  ReviewTier,
  TaskDiscipline,
} from '@/lib/api/project-management.types';
import { tokens } from '@/lib/theme/tokens';

export const REVIEW_TIER_ORDER: readonly ReviewTier[] = [
  'DISCIPLINE_OWNER',
  'REVIEWER',
  'DISCIPLINE_LEAD',
  'DEPT_CHIEF',
  'INSTITUTE_CHIEF',
] as const;

export type ReviewTierStepState = 'completed' | 'current' | 'upcoming';

export function reviewTierStepLabel(tier: ReviewTier): string {
  const labels: Record<ReviewTier, string> = {
    DISCIPLINE_OWNER: 'D.Owner',
    REVIEWER: 'Reviewer',
    DISCIPLINE_LEAD: 'D.Lead',
    DEPT_CHIEF: 'Dept Chief',
    INSTITUTE_CHIEF: 'Inst. Chief',
  };
  return labels[tier] ?? tier;
}

export function orderedRequiredTiers(requiredTiers: readonly ReviewTier[]): ReviewTier[] {
  const required = new Set(requiredTiers);
  return REVIEW_TIER_ORDER.filter((tier) => required.has(tier));
}

/** Next tier in the package's required sequence after the current tier. */
export function getNextReviewTier(
  currentTier: ReviewTier | string | null | undefined,
  requiredTiers: readonly ReviewTier[],
): ReviewTier | null {
  const ordered = orderedRequiredTiers(requiredTiers);
  if (ordered.length === 0) {
    return null;
  }
  if (!currentTier) {
    return ordered[0] ?? null;
  }
  const currentIndex = ordered.indexOf(currentTier as ReviewTier);
  if (currentIndex < 0 || currentIndex >= ordered.length - 1) {
    return null;
  }
  return ordered[currentIndex + 1] ?? null;
}

/** Tier immediately before the current tier in the package's required sequence. */
export function getPreviousReviewTier(
  currentTier: ReviewTier | string | null | undefined,
  requiredTiers: readonly ReviewTier[],
): ReviewTier | null {
  const ordered = orderedRequiredTiers(requiredTiers);
  if (!currentTier) {
    return null;
  }
  const currentIndex = ordered.indexOf(currentTier as ReviewTier);
  if (currentIndex <= 0) {
    return null;
  }
  return ordered[currentIndex - 1] ?? null;
}

export function getReviewTierStepState(
  tier: ReviewTier,
  requiredTiers: readonly ReviewTier[],
  currentTier: ReviewTier | string | null | undefined,
  sessionStatus: string | null | undefined,
): ReviewTierStepState {
  const ordered = orderedRequiredTiers(requiredTiers);
  const tierIndex = ordered.indexOf(tier);
  if (tierIndex < 0) {
    return 'upcoming';
  }
  if (sessionStatus === 'APPROVED' || sessionStatus === 'CLOSED') {
    return 'completed';
  }
  if (!currentTier) {
    return tierIndex === 0 ? 'current' : 'upcoming';
  }
  const currentIndex = ordered.indexOf(currentTier as ReviewTier);
  if (currentIndex < 0) {
    return 'upcoming';
  }
  if (tierIndex < currentIndex) {
    return 'completed';
  }
  if (tierIndex === currentIndex) {
    return 'current';
  }
  return 'upcoming';
}

export function resolveTierActorUserId(
  discipline: Partial<
    Pick<
      TaskDiscipline,
      | 'ownerUserId'
      | 'reviewerUserId'
      | 'disciplineLeadUserId'
      | 'chiefUserId'
      | 'instituteChiefUserId'
    >
  >,
  tier: ReviewTier | string | null | undefined,
): string | null {
  switch (tier) {
    case 'DISCIPLINE_OWNER':
      return discipline.ownerUserId ?? null;
    case 'REVIEWER':
      return discipline.reviewerUserId ?? null;
    case 'DISCIPLINE_LEAD':
      return discipline.disciplineLeadUserId ?? null;
    case 'DEPT_CHIEF':
      return discipline.chiefUserId ?? null;
    case 'INSTITUTE_CHIEF':
      return discipline.instituteChiefUserId ?? null;
    default:
      return null;
  }
}

export function reviewTierLabel(tier: ReviewTier): string {
  const labels: Record<ReviewTier, string> = {
    DISCIPLINE_OWNER: 'Discipline owner',
    REVIEWER: 'Reviewer',
    DISCIPLINE_LEAD: 'Discipline lead',
    DEPT_CHIEF: 'Dept chief',
    INSTITUTE_CHIEF: 'Institute chief',
  };
  return labels[tier] ?? tier;
}

/**
 * Bilingual tier label for governance-facing surfaces (comment tier badges,
 * return-reason banners). DISCIPLINE_OWNER has no confirmed Chinese text yet
 * - English-only until supplied.
 */
export function reviewTierBilingualLabel(tier: ReviewTier | string): string {
  const labels: Record<ReviewTier, string> = {
    DISCIPLINE_OWNER: 'Discipline Owner',
    REVIEWER: 'Reviewer (复核)',
    DISCIPLINE_LEAD: 'Disciplinary Leader (专册)',
    DEPT_CHIEF: '(Deputy) Chief Engineer of The Department (院审)',
    INSTITUTE_CHIEF: 'Chief Engineer of The Institute (司审)',
  };
  return (labels as Record<string, string>)[tier] ?? tier;
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
    INSTITUTE_CHIEF: { bg: tokens.colorGray50, text: tokens.colorNavy },
  };
  return map[tier] ?? { bg: tokens.colorGray50, text: tokens.colorGray600 };
}
