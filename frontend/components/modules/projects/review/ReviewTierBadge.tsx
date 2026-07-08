'use client';

import type { ReviewTier } from '@/lib/api/epc.types';
import { reviewTierBilingualLabel, reviewTierColors } from '@/lib/utils/review-tier-display';

export default function ReviewTierBadge({
  tier,
}: {
  tier: ReviewTier | string | null;
}): React.ReactNode {
  if (!tier) {
    return null;
  }
  const colors = reviewTierColors(tier as ReviewTier);

  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {reviewTierBilingualLabel(tier)}
    </span>
  );
}
