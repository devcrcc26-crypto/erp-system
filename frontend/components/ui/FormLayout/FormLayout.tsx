// UI polish pass - styles only, no logic changes

'use client';

import Card from '@/components/ui/Card/Card';
import { tokens } from '@/lib/theme/tokens';
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
  description?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}): React.ReactNode {
  const hasHeader = Boolean(title || extra);

  return (
    <Card
      variant="borderless"
      className={`erp-responsive-card ${className ?? ''}`}
      styles={{
        body: { padding: hasHeader ? '0' : '16px 18px' },
      }}
      style={{
        borderRadius: tokens.borderRadiusCard,
        border: `0.5px solid ${tokens.colorBorder}`,
        boxShadow: 'none',
        background: tokens.colorCardBg,
      }}
    >
      {hasHeader && (
        <div
          className="flex flex-col gap-3 px-[18px] py-[14px] sm:flex-row sm:items-start sm:justify-between sm:gap-4"
          style={{ borderBottom: `0.5px solid ${tokens.colorBorder}` }}
        >
          <div className="min-w-0 flex-1">
            {title && (
              <div
                className="text-[13px] font-medium leading-[1.5]"
                style={{ color: tokens.colorTextPrimary }}
              >
                {title}
              </div>
            )}
            {description && (
              <div
                className="mt-1 text-[12px] font-normal leading-[1.5]"
                style={{ color: tokens.colorTextSecondary }}
              >
                {description}
              </div>
            )}
          </div>
          {extra && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              {extra}
            </div>
          )}
        </div>
      )}
      <div className={hasHeader ? 'px-[18px] py-4' : undefined}>{children}</div>
    </Card>
  );
}

/**
 * Page-level loading skeleton for list and dashboard views.
 */
export function PageLoadingSkeleton(): React.ReactNode {
  return (
    <div
      className="rounded-[12px] bg-white p-6"
      style={{ border: `0.5px solid ${tokens.colorBorder}` }}
    >
      <div className="erp-page-skeleton mb-4 h-5 w-40" />
      <div className="erp-page-skeleton mb-6 h-4 w-72" />
      <div className="mb-4 flex gap-3">
        <div className="erp-page-skeleton h-9 w-64 rounded-lg" />
        <div className="erp-page-skeleton h-9 w-48 rounded-lg" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="erp-page-skeleton h-10 w-full rounded" />
        ))}
      </div>
    </div>
  );
}
