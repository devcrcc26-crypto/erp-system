'use client';

import { tokens } from '@/lib/theme/tokens';

/**
 * Read-only indicator of the user's effective role on the current resource.
 */
export default function ResourceRoleContextBadge({
  label,
  readOnly = false,
}: {
  label: string;
  readOnly?: boolean;
}): React.ReactNode {
  const text = readOnly ? `Acting as: ${label} (read-only)` : `Acting as: ${label}`;

  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: tokens.colorPrimaryLight,
        color: tokens.colorPrimary,
        border: `0.5px solid ${tokens.colorBorder}`,
      }}
      title={text}
    >
      {text}
    </span>
  );
}
