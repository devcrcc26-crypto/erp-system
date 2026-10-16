'use client';

import { useLayoutEffect, useState } from 'react';
import { Button, Space } from 'antd';

const FOOTER_HEIGHT_PX = 56;

interface MainBounds {
  left: number;
  width: number;
}

function useMainContentBounds(): MainBounds | null {
  const [bounds, setBounds] = useState<MainBounds | null>(null);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
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
  }, []);

  return bounds;
}

export interface FormPageFooterProps {
  /** Primary action (submit / save). */
  submitLabel: string;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  /** Optional secondary action on the left (e.g. reset). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
  /** Form id for native `htmlType="submit"` when using external buttons. */
  formId?: string;
  /** Use native submit via `form` attribute instead of `onSubmit`. */
  useFormAttribute?: boolean;
}

/**
 * Fixed footer bar for full-page forms - matches StepperForm / Add Employee.
 */
export default function FormPageFooter({
  submitLabel,
  onSubmit,
  isSubmitting = false,
  submitDisabled = false,
  secondaryLabel,
  onSecondary,
  secondaryDisabled = false,
  formId,
  useFormAttribute = false,
}: FormPageFooterProps): React.ReactNode {
  const mainBounds = useMainContentBounds();

  return (
    <>
      <div style={{ height: FOOTER_HEIGHT_PX + 16 }} aria-hidden />
      <div
        className="erp-form-page-footer flex flex-wrap items-center justify-end gap-3 border-t px-3 py-3 sm:px-6"
        style={{
          borderColor: 'rgba(0,0,0,0.06)',
          background: 'rgba(255, 255, 255, 0.4)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 -6px 16px -8px rgba(0, 0, 0, 0.06)',
          position: 'fixed',
          bottom: 0,
          left: mainBounds?.left ?? 0,
          width: mainBounds?.width ?? '100%',
          zIndex: 40,
          minHeight: FOOTER_HEIGHT_PX,
        }}
      >
        <Space size={8} wrap>
          {secondaryLabel && onSecondary ? (
            <Button
              onClick={onSecondary}
              disabled={secondaryDisabled || isSubmitting}
              style={{ borderRadius: 0 }}
            >
              {secondaryLabel}
            </Button>
          ) : null}
          <Button
            type="primary"
            htmlType={useFormAttribute ? 'submit' : 'button'}
            form={useFormAttribute ? formId : undefined}
            loading={isSubmitting}
            disabled={submitDisabled}
            onClick={
              useFormAttribute
                ? undefined
                : () => {
                    onSubmit?.();
                  }
            }
            style={{ borderRadius: 0 }}
          >
            {submitLabel}
          </Button>
        </Space>
      </div>
    </>
  );
}
