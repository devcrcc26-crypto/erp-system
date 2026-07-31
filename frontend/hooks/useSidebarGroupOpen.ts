'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Persists a sidebar domain-group open/closed flag in localStorage.
 */
export function useSidebarGroupOpen(
  storageKey: string,
  defaultOpen = true,
): {
  open: boolean;
  toggle: () => void;
} {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) {
        setOpen(defaultOpen);
      } else {
        setOpen(raw === 'true');
      }
    } catch {
      setOpen(defaultOpen);
    }
  }, [storageKey, defaultOpen]);

  const toggle = useCallback((): void => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }, [storageKey]);

  return { open, toggle };
}
