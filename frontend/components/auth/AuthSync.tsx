'use client';

import { useEffect } from 'react';
import { setAuthCookie, clearAuthCookie } from '@/lib/auth/session';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Keeps the middleware auth cookie in sync with the Zustand session.
 * Without this, a page refresh restores tokens from localStorage but the
 * cookie is missing — client-side navigation then fails with "Failed to fetch".
 */
export function AuthSync(): null {
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    const syncCookie = (): void => {
      if (useAuthStore.getState().accessToken) {
        setAuthCookie();
      } else {
        clearAuthCookie();
      }
    };

    syncCookie();

    const unsubscribe = useAuthStore.persist.onFinishHydration(syncCookie);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (accessToken) {
      setAuthCookie();
    } else {
      clearAuthCookie();
    }
  }, [accessToken]);

  return null;
}
