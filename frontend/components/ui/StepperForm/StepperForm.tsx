'use client';

import { useState } from 'react';
import { Button, Steps } from 'antd';
import { tokens } from '@/lib/theme/tokens';

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
  submitLabel = 'Submit',
  isSubmitting = false,
}: StepperFormProps): React.ReactNode {
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
      <div
        className="sticky top-0 z-10 px-6 pb-4 pt-6 sm:px-8"
        style={{
          background: tokens.colorCardBg,
          borderBottom: `1px solid ${tokens.colorBorder}`,
        }}
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

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
        {active.content}
      </div>

      <div
        className="sticky bottom-0 z-10 flex items-center justify-between gap-3 px-6 py-4 sm:px-8"
        style={{
          background: tokens.colorCardBg,
          borderTop: `1px solid ${tokens.colorBorder}`,
        }}
      >
        <Button
          onClick={handleBack}
          disabled={current === 0 || isSubmitting || validating}
        >
          Back
        </Button>
        <div className="flex gap-2">
          {current < steps.length - 1 ? (
            <Button
              type="primary"
              onClick={() => void handleNext()}
              loading={validating}
              disabled={isSubmitting}
            >
              Next
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={() => void handleSubmit()}
              loading={isSubmitting}
              disabled={validating}
            >
              {submitLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default StepperForm;
