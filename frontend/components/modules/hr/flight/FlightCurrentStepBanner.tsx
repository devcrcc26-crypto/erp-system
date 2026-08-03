'use client';

import {
  getCurrentStep,
  flightCurrentStepBannerStyle,
} from '@/lib/utils/flight-display';
import type { FlightApplicationDetail } from '@/lib/api/flight.types';

/**
 * Prominent current-step banner for flight application detail views.
 */
export default function FlightCurrentStepBanner({
  application,
}: {
  application: Pick<
    FlightApplicationDetail,
    | 'status'
    | 'combinedTicketDocumentId'
    | 'passengers'
    | 'needsTicketAttachment'
    | 'currentStepLabel'
  > & { rejectionNote?: string | null };
}): React.ReactNode {
  const currentStep = getCurrentStep(application);
  if (!currentStep) {
    return null;
  }

  const style = flightCurrentStepBannerStyle(currentStep.color);

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
