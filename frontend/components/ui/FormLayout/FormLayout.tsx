// UI polish pass - styles only, no logic changes

'use client';

import Card from '@/components/ui/Card/Card';
import { tokens } from '@/lib/theme/tokens';
import type { ReactNode } from 'react';

export type FormLayoutVariant = 'default' | 'pro';

/**
 * White section card used for forms and settings panels.
 */
export default function FormLayout({
  title,
  description,
  extra,
  children,
  className,
  variant = 'default',
  dense = false,
}: {
  title?: string;
  description?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: FormLayoutVariant;
  /** Smaller padding for compact steppers and dense forms. */
  dense?: boolean;
}): React.ReactNode {
  const hasHeader = Boolean(title || extra);
  const isPro = variant === 'pro';
  const headerPad = dense
    ? isPro
      ? 'px-4 py-3'
      : 'px-3 py-2.5'
    : isPro
      ? 'px-6 py-4'
      : 'px-[18px] py-[14px]';
  const bodyPad = dense
    ? isPro
      ? 'px-4 py-3'
      : 'px-3 py-3'
    : isPro
      ? 'px-6 py-6'
      : 'px-[18px] py-4';
  const bodyOnlyPad = dense
    ? isPro
      ? '12px 16px'
      : '12px 14px'
    : isPro
      ? '24px'
      : '16px 18px';

  return (
    <Card
      variant="borderless"
      className={`erp-responsive-card ${className ?? ''}`}
      styles={{
        body: { padding: hasHeader ? '0' : bodyOnlyPad },
      }}
      style={{
        borderRadius: isPro ? 2 : tokens.borderRadiusCard,
        border: isPro ? 'none' : `0.5px solid ${tokens.colorBorder}`,
        boxShadow: isPro
          ? '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)'
          : 'none',
        background: tokens.colorCardBg,
      }}
    >
      {hasHeader && (
        <div
          className={`flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 ${headerPad}`}
          style={{ borderBottom: `0.5px solid ${tokens.colorBorder}` }}
        >
          <div className="min-w-0 flex-1">
            {title && (
              <div
                className={`font-medium leading-[1.5] ${
                  isPro ? (dense ? 'text-[14px]' : 'text-[16px]') : 'text-[13px]'
                }`}
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
      <div className={hasHeader ? bodyPad : undefined}>{children}</div>
    </Card>
  );
}

/**
 * Page-level loading skeleton for list and dashboard views.
 */
export function PageLoadingSkeleton(): React.ReactNode {
  return (
    <div
      className="rounded-[12px] bg-white p-4 sm:p-6"
      style={{ border: `0.5px solid ${tokens.colorBorder}` }}
    >
      <div className="erp-page-skeleton mb-4 h-5 w-32 max-w-full sm:w-40" />
      <div className="erp-page-skeleton mb-6 h-4 w-full max-w-xs" />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="erp-page-skeleton h-9 w-full max-w-xs rounded-lg sm:w-64" />
        <div className="erp-page-skeleton h-9 w-full max-w-[12rem] rounded-lg sm:w-48" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="erp-page-skeleton h-10 w-full rounded" />
        ))}
      </div>
    </div>
  );
}
