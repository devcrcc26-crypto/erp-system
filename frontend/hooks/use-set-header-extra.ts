'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useHeaderExtraStore } from '@/stores/header-extra.store';

/**
 * Injects content into the sticky header's right-hand slot for as long as the
 * calling component is mounted; clears it on unmount.
 */
export function useSetHeaderExtra(node: ReactNode | null): void {
  const setExtra = useHeaderExtraStore((state) => state.setExtra);

  useEffect(() => {
    setExtra(node);
    return () => setExtra(null);
  }, [node, setExtra]);
}
