'use client';

import { useEffect } from 'react';
import { useBreadcrumbLabelStore } from '@/stores/breadcrumb-label.store';

/**
 * Overrides the current page's breadcrumb label while the caller is mounted.
 */
export function useSetBreadcrumbLabel(label: string | null): void {
  const setCurrentLabel = useBreadcrumbLabelStore(
    (state) => state.setCurrentLabel,
  );

  useEffect(() => {
    setCurrentLabel(label);
    return () => setCurrentLabel(null);
  }, [label, setCurrentLabel]);
}
