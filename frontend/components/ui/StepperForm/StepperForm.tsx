'use client';

import { useState } from 'react';
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
  submitLabel?: string;
  isSubmitting?: boolean;
  /** When `sections`, step content renders as stacked cards on the page background. */
  contentVariant?: 'card' | 'sections';
}

/**
 * Full-height multi-step form shell with sticky Steps header and nav footer.
 */
export function StepperForm({
  steps,
  onSubmit,
  submitLabel,
  isSubmitting = false,
  contentVariant = 'card',
}: StepperFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const resolvedSubmitLabel = submitLabel ?? t('hr.buttons.submitRequest');
  const [current, setCurrent] = useState(0);
  const [validating, setValidating] = useState(false);

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

  async function handleSubmit(): Promise<void> {
    await onSubmit();
  }

  const active = steps[current];
  if (!active) {
    return null;
  }

  const isSections = contentVariant === 'sections';

  return (
    <div
      className={`erp-stepper-form flex w-full min-h-0 flex-1 flex-col ${
        isSections ? 'erp-advanced-form' : ''
      }`}
      style={{
        minHeight: isSections ? 'calc(100dvh - 10.5rem)' : 'calc(100dvh - 9rem)',
      }}
    >
      <div
        className="sticky top-0 z-10 shrink-0 border-b bg-white px-4 pb-4 pt-4 sm:px-6"
        style={{ borderColor: 'rgba(0,0,0,0.06)' }}
      >
        <Steps
          current={current}
          size="small"
          items={steps.map((step) => ({
            title: step.title,
            icon: step.icon,
          }))}
        />
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-0 py-6"
        style={{ background: tokens.colorPageBg }}
      >
        {isSections ? (
          <div className="flex flex-col gap-6">{active.content}</div>
        ) : (
          <div
            className="rounded-lg border bg-white p-6"
            style={{ borderColor: 'rgba(0,0,0,0.08)' }}
          >
            {active.content}
          </div>
        )}
      </div>

      <div
        className="erp-stepper-form__footer sticky bottom-0 z-20 flex shrink-0 items-center justify-end gap-2 border-t bg-white px-4 py-3 sm:px-6"
        style={{
          borderColor: 'rgba(0,0,0,0.06)',
          boxShadow: '0 -6px 16px -8px rgba(0, 0, 0, 0.08)',
        }}
      >
        <Button
          onClick={handleBack}
          disabled={current === 0 || isSubmitting || validating}
          style={{ borderRadius: 2 }}
        >
          {t('hr.buttons.back')}
        </Button>
        {current < steps.length - 1 ? (
          <Button
            type="primary"
            onClick={() => void handleNext()}
            loading={validating}
            disabled={isSubmitting}
            style={{ borderRadius: 2 }}
          >
            {t('hr.buttons.next')}
          </Button>
        ) : (
          <Button
            type="primary"
            onClick={() => void handleSubmit()}
            loading={isSubmitting}
            disabled={validating}
            style={{ borderRadius: 2 }}
          >
            {resolvedSubmitLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export default StepperForm;
