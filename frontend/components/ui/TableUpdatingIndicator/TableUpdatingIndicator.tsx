'use client';

import { Spin } from 'antd';

/**
 * Subtle inline "Updating…" indicator shown above a table while a background
 * refetch runs, so the table stays mounted instead of unmounting to a skeleton.
 */
export default function TableUpdatingIndicator({
  active,
}: {
  active: boolean;
}): React.ReactNode {
  if (!active) {
    return null;
  }

  return (
    <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
      <Spin size="small" />
      <span>Updating…</span>
    </div>
  );
}
