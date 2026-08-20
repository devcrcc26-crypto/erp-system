// UI polish pass - styles only, no logic changes

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  RAIL_COLLAPSED_WIDTH,
  RAIL_EXPANDED_WIDTH,
} from '@/components/ui/shell/shell-layout';
import { useIsLgUp } from '@/hooks/useMediaQuery';

const STORAGE_KEY = 'rail:expanded';

export interface UseRailExpandedResult {
  pinned: boolean;
  isExpanded: boolean;
  layoutWidth: typeof RAIL_COLLAPSED_WIDTH | typeof RAIL_EXPANDED_WIDTH;
  toggleExpanded: () => void;
}

/**
 * localStorage-backed icon rail expand/collapse. Toggle only — no hover peek.
 * Expand state is ignored below the lg breakpoint (mobile uses the drawer).
 */
export function useRailExpanded(): UseRailExpandedResult {
  const isLgUp = useIsLgUp();
  const [pinned, setPinned] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setPinned(localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {
      setPinned(false);
    }
    setHydrated(true);
  }, []);

  const persistPinned = useCallback((next: boolean): void => {
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const effectivePinned = hydrated && pinned && isLgUp;

  const toggleExpanded = useCallback((): void => {
    if (!isLgUp) {
      return;
    }
    setPinned((prev) => {
      const next = !prev;
      persistPinned(next);
      return next;
    });
  }, [isLgUp, persistPinned]);

  return {
    pinned: effectivePinned,
    isExpanded: effectivePinned,
    layoutWidth: effectivePinned ? RAIL_EXPANDED_WIDTH : RAIL_COLLAPSED_WIDTH,
    toggleExpanded,
  };
}
