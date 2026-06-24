// UI polish pass — styles only, no logic changes

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
  description?: string;
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
              <p
                className="mt-1 text-[12px] font-normal leading-[1.5]"
                style={{ color: tokens.colorTextSecondary }}
              >
                {description}
              </p>
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
