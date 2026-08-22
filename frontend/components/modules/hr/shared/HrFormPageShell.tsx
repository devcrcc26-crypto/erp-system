'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { tokens } from '@/lib/theme/tokens';

export interface HrFormPageShellProps {
  title: string;
  description?: string;
  cancelLabel: string;
  cancelHref?: string;
  onCancel?: () => void;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Page chrome for HR / Approvals create forms — aligned with Users and Leave Policy layouts.
 */
export default function HrFormPageShell({
  title,
  description,
  cancelLabel,
  cancelHref,
  onCancel,
  headerExtra,
  children,
}: HrFormPageShellProps): React.ReactNode {
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleCancel(): void {
    if (onCancel) {
      onCancel();
      return;
    }
    if (cancelHref) {
      router.push(cancelHref);
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="m-0 text-xl font-semibold tracking-tight"
            style={{
              color: tokens.colorTextPrimary,
              fontFamily: tokens.fontFamily,
            }}
          >
            {title}
          </h1>
          {description ? (
            <p
              className="mb-0 mt-1 text-sm"
              style={{ color: tokens.colorTextSecondary }}
            >
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {headerExtra}
          {onCancel || cancelHref ? (
            <Button onClick={handleCancel} style={{ borderRadius: 0 }}>
              {cancelLabel}
            </Button>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
