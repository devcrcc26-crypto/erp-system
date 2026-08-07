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
}

/**
 * Full-height multi-step form shell with sticky Steps header and nav footer.
 */
export function StepperForm({
  steps,
  onSubmit,
  submitLabel,
  isSubmitting = false,
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

  return (
    <div
      className="flex w-full min-h-0 flex-col"
      style={{ minHeight: 'calc(100dvh - 9rem)' }}
    >
      <div className="sticky top-0 z-10 border-b border-[rgba(0,0,0,0.08)] bg-white px-6 pb-4 pt-6 sm:px-8">
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
        className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8"
        style={{ background: tokens.colorPageBg }}
      >
        <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] p-6">
          {active.content}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-[rgba(0,0,0,0.08)] bg-white px-6 py-4 sm:px-8">
        <Button
          onClick={handleBack}
          disabled={current === 0 || isSubmitting || validating}
        >
          {t('hr.buttons.back')}
        </Button>
        <div className="flex gap-2">
          {current < steps.length - 1 ? (
            <Button
              type="primary"
              onClick={() => void handleNext()}
              loading={validating}
              disabled={isSubmitting}
            >
              {t('hr.buttons.next')}
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={() => void handleSubmit()}
              loading={isSubmitting}
              disabled={validating}
            >
              {resolvedSubmitLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default StepperForm;
