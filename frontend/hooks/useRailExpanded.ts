// UI polish pass — styles only, no logic changes

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RAIL_COLLAPSED_WIDTH,
  RAIL_EXPANDED_WIDTH,
} from '@/components/ui/shell/shell-layout';
import { useIsLgUp } from '@/hooks/useMediaQuery';

const STORAGE_KEY = 'rail:expanded';
const PEEK_LEAVE_DELAY_MS = 200;

export interface UseRailExpandedResult {
  pinned: boolean;
  isPeeking: boolean;
  isExpanded: boolean;
  layoutWidth: typeof RAIL_COLLAPSED_WIDTH | typeof RAIL_EXPANDED_WIDTH;
  togglePinned: () => void;
  onPeekEnter: () => void;
  onPeekLeave: () => void;
}

/**
 * localStorage-backed icon rail pin state with hover-to-peek when collapsed.
 * Pinning is disabled below the lg breakpoint so mobile layout stays full-width.
 */
export function useRailExpanded(): UseRailExpandedResult {
  const isLgUp = useIsLgUp();
  const [pinned, setPinned] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      setPinned(localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {
      setPinned(false);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!isLgUp) {
      setIsPeeking(false);
    }
  }, [isLgUp]);

  const clearLeaveTimer = useCallback((): void => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearLeaveTimer, [clearLeaveTimer]);

  const effectivePinned = hydrated && pinned && isLgUp;

  const togglePinned = useCallback((): void => {
    if (!isLgUp) {
      return;
    }
    setPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore quota / private mode */
      }
      if (next) {
        setIsPeeking(false);
      }
      return next;
    });
  }, [isLgUp]);

  const onPeekEnter = useCallback((): void => {
    if (effectivePinned || !isLgUp) {
      return;
    }
    clearLeaveTimer();
    setIsPeeking(true);
  }, [effectivePinned, isLgUp, clearLeaveTimer]);

  const onPeekLeave = useCallback((): void => {
    if (effectivePinned || !isLgUp) {
      return;
    }
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      setIsPeeking(false);
      leaveTimerRef.current = null;
    }, PEEK_LEAVE_DELAY_MS);
  }, [effectivePinned, isLgUp, clearLeaveTimer]);

  const isExpanded = effectivePinned || isPeeking;
  const layoutWidth = effectivePinned ? RAIL_EXPANDED_WIDTH : RAIL_COLLAPSED_WIDTH;

  return {
    pinned: effectivePinned,
    isPeeking,
    isExpanded,
    layoutWidth,
    togglePinned,
    onPeekEnter,
    onPeekLeave,
  };
}
