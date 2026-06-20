'use client';

import Card from '@/components/ui/Card/Card';
import { cardStyles, layout } from '@/lib/theme/layout';
import type { ReactNode } from 'react';

/**
 * White section card used for forms and settings panels.
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
  const hasHeader = Boolean(title || extra);

  return (
    <Card
      variant="borderless"
      className={`border border-slate-200 erp-responsive-card ${className ?? ''}`}
      styles={cardStyles}
      style={{ borderRadius: 8, boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.06)' }}
    >
      {hasHeader && (
        <div className={`${layout.formHeader} border-b border-slate-100`}>
          <div className="min-w-0 flex-1">
            {title && (
              <div className="text-base font-semibold text-slate-900 sm:text-lg">
                {title}
              </div>
            )}
            {description && (
              <p className="mt-1 text-sm font-normal text-slate-500">{description}</p>
            )}
          </div>
          {extra && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              {extra}
            </div>
          )}
        </div>
      )}
      <div className={hasHeader ? 'pt-4 sm:pt-6' : undefined}>{children}</div>
    </Card>
  );
}
