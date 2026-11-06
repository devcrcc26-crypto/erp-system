'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Steps } from 'antd';
import { tokens } from '@/lib/theme/tokens';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useIsMdUp } from '@/hooks/useMediaQuery';

export interface StepperFormStep {
  title: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
  validate?: () => Promise<boolean> | boolean;
}

export interface StepperFormProps {
  steps: StepperFormStep[];
  onSubmit: () => Promise<void>;
  onReset?: () => void;
  /** Leave / abandon form — rendered on the same row as Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  submitLabel?: string;
  resetLabel?: string;
  isSubmitting?: boolean;
  /** When `sections`, step content renders as stacked cards on the page background. */
  contentVariant?: 'card' | 'sections';
  /** Tighter layout without forcing a full-viewport height. */
  compact?: boolean;
  /** Extra footer buttons shown before Reset (e.g. "Save as draft"). */
  extraActions?: React.ReactNode;
}

const FOOTER_HEIGHT_PX = 56;

interface MainBounds {
  left: number;
  width: number;
}

function useMainContentBounds(enabled: boolean): MainBounds | null {
  const [bounds, setBounds] = useState<MainBounds | null>(null);

  useLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const main = document.querySelector('main');
    if (!main) {
      return;
    }

    function update(): void {
      const rect = main.getBoundingClientRect();
      setBounds({ left: rect.left, width: rect.width });
    }

    update();

    const observer = new ResizeObserver(update);
    observer.observe(main);
    window.addEventListener('resize', update);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  return bounds;
}

/**
 * Full-height multi-step form shell with sticky Steps header and nav footer.
 * Below md: compact progress strip (not sticky) + single-row footer so the
 * form keeps most of the viewport.
 */
export function StepperForm({
  steps,
  onSubmit,
  onReset,
  onCancel,
  cancelLabel,
  submitLabel,
  resetLabel,
  isSubmitting = false,
  contentVariant = 'card',
  compact = false,
  extraActions,
}: StepperFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const isMdUp = useIsMdUp();
  const resolvedSubmitLabel = submitLabel ?? t('hr.buttons.submitRequest');
  const resolvedResetLabel = resetLabel ?? t('hr.buttons.reset');
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel');
  const [current, setCurrent] = useState(0);
  const [validating, setValidating] = useState(false);
  const isSections = contentVariant === 'sections';
  const mainBounds = useMainContentBounds(isSections);
  const stepsScrollRef = useRef<HTMLDivElement>(null);
  const showCompactProgress = !isMdUp;

  // Desktop horizontal strip: keep the active step in view without jumping the page.
  useEffect(() => {
    if (showCompactProgress) {
      return;
    }
    const strip = stepsScrollRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) {
      return;
    }
    const activeItem = strip.querySelectorAll<HTMLElement>('.ant-steps-item')[current];
    if (!activeItem) {
      return;
    }
    const stripRect = strip.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    strip.scrollBy({
      left: itemRect.left - stripRect.left - (stripRect.width - itemRect.width) / 2,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [current, showCompactProgress]);

  async function handleNext(): Promise<void> {
    setValidating(true);
    try {
      const step = steps[current];
      if (step?.validate) {
        const valid = await step.validate();
        if (!valid) {
          return;
        }
      }
      setCurrent((prev) => Math.min(prev + 1, steps.length - 1));
    } finally {
      setValidating(false);
    }
  }

  function handleBack(): void {
    setCurrent((prev) => Math.max(prev - 1, 0));
  }

  function handleReset(): void {
    setCurrent(0);
    onReset?.();
  }

  async function handleSubmit(): Promise<void> {
    await onSubmit();
  }

  const active = steps[current];
  if (!active) {
    return null;
  }

  const progressPct =
    steps.length > 0 ? Math.round(((current + 1) / steps.length) * 100) : 0;

  const footer = (
    <div
      className="erp-stepper-form__footer flex min-w-0 items-center gap-2 border-t px-3 py-2 sm:justify-between sm:gap-3 sm:px-6 sm:py-3"
      style={{
        borderColor: 'rgba(0,0,0,0.06)',
        background: 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 -6px 16px -8px rgba(0, 0, 0, 0.06)',
        ...(isSections
          ? {
              position: 'fixed',
              bottom: 0,
              left: mainBounds?.left ?? 0,
              width: mainBounds?.width ?? '100%',
              zIndex: 40,
              minHeight: FOOTER_HEIGHT_PX,
            }
          : {
              position: 'sticky',
              bottom: 0,
              zIndex: 20,
            }),
      }}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        {onCancel ? (
          <Button
            onClick={onCancel}
            disabled={isSubmitting || validating}
            className="min-w-0 shrink !px-3 sm:!px-4"
            style={{ borderRadius: 8 }}
          >
            {resolvedCancelLabel}
          </Button>
        ) : null}
        <Button
          onClick={handleBack}
          disabled={current === 0 || isSubmitting || validating}
          className="min-w-0 shrink !px-3 sm:!px-4"
          style={{ borderRadius: 8 }}
        >
          {t('hr.buttons.back')}
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {extraActions}
        {onReset ? (
          <Button
            onClick={handleReset}
            disabled={isSubmitting || validating}
            className="min-w-0 shrink !px-3 sm:!px-4"
            style={{ borderRadius: 8 }}
          >
            {resolvedResetLabel}
          </Button>
        ) : null}
        {current < steps.length - 1 ? (
          <Button
            type="primary"
            onClick={() => void handleNext()}
            loading={validating}
            disabled={isSubmitting}
            className="min-w-0 shrink !px-3 sm:!px-4"
            style={{ borderRadius: 8 }}
          >
            {t('hr.buttons.next')}
          </Button>
        ) : (
          <Button
            type="primary"
            onClick={() => void handleSubmit()}
            loading={isSubmitting}
            disabled={validating}
            className="min-w-0 max-w-[55%] truncate !px-3 sm:max-w-none sm:!px-4"
            style={{ borderRadius: 8 }}
          >
            {resolvedSubmitLabel}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`erp-stepper-form flex w-full min-h-0 min-w-0 max-w-full flex-1 flex-col ${
        isSections ? 'erp-advanced-form' : ''
      } ${compact ? 'erp-stepper-form--compact' : ''} ${
        showCompactProgress ? 'erp-stepper-form--mobile' : ''
      }`}
      style={{
        minHeight: compact
          ? undefined
          : isSections
            ? 'calc(100dvh - 10.5rem)'
            : 'calc(100dvh - 9rem)',
        background: isSections ? 'transparent' : undefined,
        paddingBottom: isSections ? FOOTER_HEIGHT_PX + 16 : undefined,
      }}
    >
      <div
        className={`shrink-0 px-0 ${
          showCompactProgress
            ? 'relative z-0'
            : `sticky top-0 z-10 ${compact ? 'pb-3 pt-1' : 'pb-4 pt-2'}`
        } ${isSections ? 'erp-stepper-form__steps-shell' : 'border-b bg-white px-4 sm:px-6'}`}
        style={isSections ? undefined : { borderColor: 'rgba(0,0,0,0.06)' }}
      >
        {showCompactProgress ? (
          <div className="erp-stepper-form__mobile-progress min-w-0">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <p className="m-0 min-w-0 truncate text-sm font-semibold text-slate-900">
                {active.title}
              </p>
              <p className="m-0 shrink-0 text-xs font-medium tabular-nums text-slate-500">
                {current + 1} / {steps.length}
              </p>
            </div>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={current + 1}
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-label={`${current + 1} / ${steps.length}`}
            >
              <div
                className="h-full rounded-full bg-emerald-600 transition-[width] duration-200 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : (
          <div ref={stepsScrollRef} className="min-w-0 overflow-x-auto">
            <Steps
              current={current}
              size="small"
              orientation="horizontal"
              responsive={false}
              items={steps.map((step) => ({
                title: step.title,
                icon: step.icon,
              }))}
            />
          </div>
        )}
      </div>

      <div
        className={`min-h-0 min-w-0 max-w-full ${compact ? 'shrink-0' : 'flex-1'} overflow-y-auto overflow-x-hidden px-0 ${
          compact ? 'py-2' : showCompactProgress ? 'py-3' : 'py-4'
        }`}
        style={{ background: isSections ? 'transparent' : tokens.colorPageBg }}
      >
        {isSections ? (
          <div className={`flex flex-col ${compact ? 'gap-3' : 'gap-6'}`}>
            {steps.map((step, index) => (
              <div key={index} style={{ display: index === current ? undefined : 'none' }}>
                {step.content}
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`rounded-lg border bg-white ${compact ? 'p-4' : 'p-6'}`}
            style={{ borderColor: 'rgba(0,0,0,0.08)' }}
          >
            {steps.map((step, index) => (
              <div key={index} style={{ display: index === current ? undefined : 'none' }}>
                {step.content}
              </div>
            ))}
          </div>
        )}
      </div>

      {footer}
    </div>
  );
}

export default StepperForm;
