'use client';

import Card from '@/components/ui/Card/Card';
import { cardStyles } from '@/lib/theme/layout';
import type { ReactNode } from 'react';

/**
 * White section card used for forms and settings panels.
 * Matches the existing `rounded-md bg-white p-6 shadow-sm` pattern.
 */
export default function FormLayout({
  title,
  description,
  extra,
  children,
  className,
}: {
  title?: string;
  description?: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}): React.ReactNode {
  return (
    <Card
      variant="borderless"
      title={
        title ? (
          <div>
            <div className="text-lg font-semibold text-slate-900">{title}</div>
            {description && (
              <p className="mt-1 text-sm font-normal text-slate-500">{description}</p>
            )}
          </div>
        ) : undefined
      }
      extra={extra}
      className={`border border-slate-200 ${className ?? ''}`}
      styles={cardStyles}
      style={{ borderRadius: 8, boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.06)' }}
    >
      {children}
    </Card>
  );
}
