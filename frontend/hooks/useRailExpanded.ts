'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'rail:expanded';
const PEEK_LEAVE_DELAY_MS = 200;

export interface UseRailExpandedResult {
  /** Rail is pinned open (220px, persisted). */
  pinned: boolean;
  /** Temporary hover expansion while collapsed and unpinned. */
  isPeeking: boolean;
  /** Visual expanded state (pinned or peeking). */
  isExpanded: boolean;
  /** Width consumed in the layout row (64 or 256 when pinned). */
  layoutWidth: 64 | 256;
  togglePinned: () => void;
  onPeekEnter: () => void;
  onPeekLeave: () => void;
}

/**
 * localStorage-backed icon rail pin state with hover-to-peek when collapsed.
 */
export function useRailExpanded(): UseRailExpandedResult {
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

  const clearLeaveTimer = useCallback((): void => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearLeaveTimer, [clearLeaveTimer]);

  const togglePinned = useCallback((): void => {
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
  }, []);

  const onPeekEnter = useCallback((): void => {
    if (pinned) {
      return;
    }
    clearLeaveTimer();
    setIsPeeking(true);
  }, [pinned, clearLeaveTimer]);

  const onPeekLeave = useCallback((): void => {
    if (pinned) {
      return;
    }
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      setIsPeeking(false);
      leaveTimerRef.current = null;
    }, PEEK_LEAVE_DELAY_MS);
  }, [pinned, clearLeaveTimer]);

  const isExpanded = pinned || isPeeking;
  const layoutWidth = pinned ? 256 : 64;

  return {
    pinned: hydrated ? pinned : false,
    isPeeking,
    isExpanded,
    layoutWidth,
    togglePinned,
    onPeekEnter,
    onPeekLeave,
  };
}
