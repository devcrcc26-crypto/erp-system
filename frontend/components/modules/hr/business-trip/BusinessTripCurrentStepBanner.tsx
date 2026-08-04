'use client';

import {
  getCurrentStep,
  businessTripCurrentStepBannerStyle,
} from '@/lib/utils/business-trip-display';
import type { BusinessTripDetail } from '@/lib/api/business-trip.types';

/**
 * Prominent current-step banner for business trip detail views.
 */
export default function BusinessTripCurrentStepBanner({
  trip,
}: {
  trip: Pick<
    BusinessTripDetail,
    | 'status'
    | 'combinedTicketDocumentId'
    | 'passengers'
    | 'needsTicketAttachment'
    | 'currentStepLabel'
  > & { rejectionNote?: string | null };
}): React.ReactNode {
  const currentStep = getCurrentStep(trip);
  if (!currentStep) {
    return null;
  }

  const style = businessTripCurrentStepBannerStyle(currentStep.color);

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3"
      style={{
        background: style.background,
        borderColor: style.borderColor,
        color: style.color,
      }}
    >
      <span className="font-semibold">Current Step:</span>
      <span>{currentStep.step}</span>
      {currentStep.description ? (
        <span className="text-sm opacity-75">— {currentStep.description}</span>
      ) : null}
    </div>
  );
}
