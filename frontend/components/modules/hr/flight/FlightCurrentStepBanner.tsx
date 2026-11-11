'use client';

import {
  getCurrentStep,
  flightCurrentStepBannerStyle,
} from '@/lib/utils/flight-display';
import type { FlightApplicationDetail } from '@/lib/api/flight.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Prominent current-step banner for flight application detail views.
 */
export default function FlightCurrentStepBanner({
  application,
  embedded = false,
}: {
  application: Pick<
    FlightApplicationDetail,
    | 'status'
    | 'combinedTicketDocumentId'
    | 'passengers'
    | 'needsTicketAttachment'
    | 'currentStepLabel'
  > & { rejectionNote?: string | null };
  /** When true, renders as a flat footer strip (no outer card chrome). */
  embedded?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const currentStep = getCurrentStep(application, t);
  if (!currentStep) {
    return null;
  }

  const style = flightCurrentStepBannerStyle(currentStep.color);

  return (
    <div
      className={
        embedded
          ? 'flex items-start gap-3 px-3 py-3 sm:px-5'
          : 'flex items-start gap-3 rounded-lg border px-3 py-3 sm:px-5'
      }
      style={{
        background: style.background,
        borderColor: embedded ? undefined : style.borderColor,
        color: style.color,
      }}
    >
      <div
        className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: style.color }}
      />
      <div className="min-w-0 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
          {t('hr.labels.currentStep')}
        </span>
        <span className="hidden sm:inline text-xs opacity-40">·</span>
        <span className="text-sm font-semibold">{currentStep.step}</span>
        {currentStep.description ? (
          <>
            <span className="hidden sm:inline text-xs opacity-40">-</span>
            <span className="text-xs sm:text-sm opacity-80">
              {currentStep.description}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
