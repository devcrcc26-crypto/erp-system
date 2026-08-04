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
      className="flex items-center gap-3 px-5 py-3 rounded-lg border mb-1"
      style={{
        background: style.background,
        borderColor: style.borderColor,
        color: style.color,
      }}
    >
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: style.color }}
      />
      <div className="min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wide mr-2">
          Current Step:
        </span>
        <span className="text-sm font-medium">{currentStep.step}</span>
        {currentStep.description ? (
          <span className="text-xs opacity-75 ml-2">
            — {currentStep.description}
          </span>
        ) : null}
      </div>
    </div>
  );
}
