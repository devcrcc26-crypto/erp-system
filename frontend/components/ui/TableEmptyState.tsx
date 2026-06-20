'use client';

import { Button } from 'antd';
import type { ReactNode } from 'react';

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
      <div className="mb-3 text-slate-400 [&_svg]:h-8 [&_svg]:w-8">{icon}</div>
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-snug text-slate-500">
          {description}
        </p>
      )}
      {action && (
        <Button type="default" ghost className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
