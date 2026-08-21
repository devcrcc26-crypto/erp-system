'use client';

import { useHeaderExtraStore } from '@/stores/header-extra.store';

/**
 * Renders page-level action buttons inside the main content area (not shell headers).
 */
export default function PageContentActions(): React.ReactNode {
  const extra = useHeaderExtraStore((state) => state.extra);

  if (!extra) {
    return null;
  }

  return (
    <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
      {extra}
    </div>
  );
}
