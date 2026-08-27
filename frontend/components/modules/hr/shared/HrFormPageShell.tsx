'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

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
  title: _title,
  description: _description,
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
      <div className="flex shrink-0 items-center justify-end gap-2">
        {headerExtra}
        {onCancel || cancelHref ? (
          <Button onClick={handleCancel} style={{ borderRadius: 0 }}>
            {cancelLabel}
          </Button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
