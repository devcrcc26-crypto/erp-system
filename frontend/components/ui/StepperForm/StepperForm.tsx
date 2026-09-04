'use client';

import { useLayoutEffect, useState } from 'react';
import { Button, Steps } from 'antd';
import { tokens } from '@/lib/theme/tokens';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

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
  submitLabel?: string;
  resetLabel?: string;
  isSubmitting?: boolean;
  /** When `sections`, step content renders as stacked cards on the page background. */
  contentVariant?: 'card' | 'sections';
  /** Tighter layout without forcing a full-viewport height. */
  compact?: boolean;
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
 */
export function StepperForm({
  steps,
  onSubmit,
  onReset,
  submitLabel,
  resetLabel,
  isSubmitting = false,
  contentVariant = 'card',
  compact = false,
}: StepperFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const resolvedSubmitLabel = submitLabel ?? t('hr.buttons.submitRequest');
  const resolvedResetLabel = resetLabel ?? t('hr.buttons.reset');
  const [current, setCurrent] = useState(0);
  const [validating, setValidating] = useState(false);
  const isSections = contentVariant === 'sections';
  const mainBounds = useMainContentBounds(isSections);

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

  const footer = (
    <div
      className="erp-stepper-form__footer flex flex-wrap items-center justify-between gap-3 border-t px-3 py-3 sm:px-6"
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
      <Button
        onClick={handleBack}
        disabled={current === 0 || isSubmitting || validating}
        style={{ borderRadius: 8 }}
      >
        {t('hr.buttons.back')}
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        {onReset ? (
          <Button
            onClick={handleReset}
            disabled={isSubmitting || validating}
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
      className={`erp-stepper-form flex w-full min-h-0 flex-1 flex-col ${
        isSections ? 'erp-advanced-form' : ''
      } ${compact ? 'erp-stepper-form--compact' : ''}`}
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
        className={`sticky top-0 z-10 shrink-0 px-0 ${
          compact ? 'pb-3 pt-1' : 'pb-4 pt-2'
        } ${isSections ? 'erp-stepper-form__steps-shell' : 'border-b bg-white px-4 sm:px-6'}`}
        style={isSections ? undefined : { borderColor: 'rgba(0,0,0,0.06)' }}
      >
        <div className="min-w-0 overflow-x-auto">
          <Steps
            current={current}
            size="small"
            responsive={false}
            items={steps.map((step) => ({
              title: step.title,
              icon: step.icon,
            }))}
          />
        </div>
      </div>

      <div
        className={`min-h-0 ${compact ? 'shrink-0' : 'flex-1'} overflow-y-auto px-0 ${
          compact ? 'py-2' : 'py-4'
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
