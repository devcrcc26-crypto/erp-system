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
  bodyClassName,
  variant = 'default',
  dense = false,
}: {
  title?: string;
  description?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Override default body padding (e.g. `p-0` for full-bleed tables). */
  bodyClassName?: string;
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
      ? 'px-4 pt-4 pb-3 sm:px-6 sm:pt-5'
      : 'px-3 py-3 sm:px-[18px] sm:py-[14px]';
  const bodyPad = dense
    ? isPro
      ? 'px-4 py-4'
      : 'px-3 py-3'
    : isPro
      ? 'px-4 py-4 sm:px-6 sm:py-5'
      : 'px-3 py-4 sm:px-[18px]';
  const bodyOnlyPad = dense
    ? isPro
      ? '16px'
      : '12px 14px'
    : isPro
      ? '20px 24px'
      : '16px 18px';
  const resolvedBodyClassName = hasHeader
    ? (bodyClassName ?? bodyPad)
    : bodyClassName;

  return (
    <Card
      variant="borderless"
      className={`erp-responsive-card${
        isPro
          ? ' erp-form-layout-pro overflow-hidden !rounded-2xl !border-0 !bg-white !shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]'
          : ''
      } ${className ?? ''}`}
      styles={{
        body: {
          padding:
            hasHeader || bodyClassName
              ? '0'
              : bodyOnlyPad,
        },
      }}
      style={
        isPro
          ? undefined
          : {
              borderRadius: tokens.borderRadiusCard,
              border: `0.5px solid ${tokens.colorBorder}`,
              boxShadow: 'none',
              background: tokens.colorCardBg,
            }
      }
    >
      {hasHeader && (
        <div
          className={`${
            isPro ? 'erp-form-layout-pro-header border-b border-slate-100 bg-white ' : ''
          }flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 ${headerPad}`}
          style={
            isPro ? undefined : { borderBottom: `0.5px solid ${tokens.colorBorder}` }
          }
        >
          <div className="min-w-0 flex-1">
            {title && (
              <div
                className={
                  isPro
                    ? 'text-[15px] leading-snug font-semibold tracking-tight text-slate-900'
                    : 'text-[13px] font-medium leading-[1.5]'
                }
                style={
                  isPro ? undefined : { color: tokens.colorTextPrimary }
                }
              >
                {title}
              </div>
            )}
            {description && (
              <div
                className={
                  isPro
                    ? 'mt-1 text-[13px] leading-snug font-normal text-slate-500'
                    : 'mt-1 text-[12px] font-normal leading-[1.5]'
                }
                style={isPro ? undefined : { color: tokens.colorTextSecondary }}
              >
                {description}
              </div>
            )}
          </div>
          {extra && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end [&>.ant-btn]:w-full sm:[&>.ant-btn]:w-auto">
              {extra}
            </div>
          )}
        </div>
      )}
      <div className={resolvedBodyClassName}>{children}</div>
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
