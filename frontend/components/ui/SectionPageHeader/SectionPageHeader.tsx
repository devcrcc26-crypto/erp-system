'use client';

import { tokens } from '@/lib/theme/tokens';

/**
 * Shared page title + description chrome for list/form section pages.
 */
export default function SectionPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="mb-2 flex items-start justify-between gap-4">
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
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
