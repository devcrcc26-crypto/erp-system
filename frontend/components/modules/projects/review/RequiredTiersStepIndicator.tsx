'use client';

import type { ReviewTier } from '@/lib/api/project-management.types';
import { tokens } from '@/lib/theme/tokens';
import {
  getReviewTierStepState,
  orderedRequiredTiers,
  reviewTierStepLabel,
  type ReviewTierStepState,
} from '@/lib/utils/review-tier-display';

function TierStepCircle({ state }: { state: ReviewTierStepState }): React.ReactNode {
  if (state === 'completed') {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: tokens.colorTeal600 }}
        aria-hidden
      />
    );
  }

  if (state === 'current') {
    return (
      <span
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border-2"
        style={{ borderColor: tokens.colorTeal600 }}
        aria-hidden
      >
        <span
          className="h-2.5 w-2.5 animate-pulse rounded-full"
          style={{ backgroundColor: tokens.colorTeal600 }}
        />
      </span>
    );
  }

  return (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white"
      style={{ borderColor: tokens.colorGray200 }}
      aria-hidden
    />
  );
}

export default function RequiredTiersStepIndicator({
  requiredTiers,
  currentTier,
  sessionStatus,
}: {
  requiredTiers: readonly ReviewTier[];
  currentTier: ReviewTier | string | null | undefined;
  sessionStatus: string | null | undefined;
}): React.ReactNode {
  const tiers = orderedRequiredTiers(requiredTiers);

  if (tiers.length === 0) {
    return <p className="text-sm text-slate-500">No review tiers configured.</p>;
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {tiers.map((tier, index) => {
        const state = getReviewTierStepState(
          tier,
          requiredTiers,
          currentTier,
          sessionStatus,
        );
        return (
          <div key={tier} className="flex items-center gap-2">
            {index > 0 ? (
              <span
                className="mb-5 h-px w-6 shrink-0"
                style={{ backgroundColor: tokens.colorGray200 }}
                aria-hidden
              />
            ) : null}
            <div className="flex min-w-[4.5rem] flex-col items-center gap-1.5">
              <TierStepCircle state={state} />
              <span
                className="text-center text-[10px] font-medium leading-tight"
                style={{ color: tokens.colorTextSecondary }}
              >
                {reviewTierStepLabel(tier)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
