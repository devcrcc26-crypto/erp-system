'use client';

import { useEffect } from 'react';
import { setAuthCookie, clearAuthCookie } from '@/lib/auth/session';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Keeps the middleware auth cookie in sync with the Zustand session.
 * Without this, a page refresh restores tokens from localStorage but the
 * cookie is missing - client-side navigation then fails with "Failed to fetch".
 *
 * Must not clear the cookie before persist hydration finishes — a new tab
 * briefly has token=null, and clearing the cookie then causes /login to be
 * bounced to `/` by the proxy once tokens restore and the cookie is rewritten.
 */
export function AuthSync(): null {
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    const syncCookie = (): void => {
      if (useAuthStore.getState().accessToken) {
        setAuthCookie();
      } else if (useAuthStore.persist.hasHydrated()) {
        clearAuthCookie();
      }
    };

    if (useAuthStore.persist.hasHydrated()) {
      syncCookie();
    }

    return useAuthStore.persist.onFinishHydration(syncCookie);
  }, []);

  useEffect(() => {
    if (!useAuthStore.persist.hasHydrated()) {
      return;
    }
    if (accessToken) {
      setAuthCookie();
    } else {
      clearAuthCookie();
    }
  }, [accessToken]);

  return null;
}
