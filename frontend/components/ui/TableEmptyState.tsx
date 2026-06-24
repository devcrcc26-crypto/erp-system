// UI polish pass - styles only, no logic changes

'use client';

import { Button } from 'antd';
import type { ReactNode } from 'react';
import { tokens } from '@/lib/theme/tokens';

export type TableEmptyStateProps = {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
};

/**
 * Structured empty state for Ant Design table locale.emptyText slots.
 */
export default function TableEmptyState({
  icon,
  title,
  description,
  action,
}: TableEmptyStateProps): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div
        className="mb-3 [&_svg]:h-10 [&_svg]:w-10"
        style={{ color: tokens.colorTextTertiary }}
      >
        {icon}
      </div>
      <p
        className="text-[14px] font-medium"
        style={{ color: tokens.colorTextPrimary }}
      >
        {title}
      </p>
      {description && (
        <p
          className="mt-1 max-w-[280px] text-[13px] font-normal leading-[1.5]"
          style={{ color: tokens.colorTextSecondary }}
        >
          {description}
        </p>
      )}
      {action && (
        <Button type="primary" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
