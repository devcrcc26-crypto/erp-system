'use client';

import { useEffect } from 'react';
import {
  AUTH_SESSION_CHANNEL,
  type AuthSessionEvent,
} from '@/lib/auth/auth-session-channel';
import { AUTH_PERSIST_KEY } from '@/stores/auth.store';
import { getQueryClient } from '@/lib/query/query-client-ref';
import { clearAuthCookie, setAuthCookie } from '@/lib/auth/session';
import { useAuthStore } from '@/stores/auth.store';
import { fetchCapabilities } from '@/lib/permissions/capabilities';

/**
 * Keeps auth state and query cache aligned when another tab signs in or out.
 */
export function AuthSessionSync(): null {
  useEffect(() => {
    const syncFromStorage = (): void => {
      void useAuthStore.persist.rehydrate().then(() => {
        const { accessToken, setCapabilities } = useAuthStore.getState();
        const queryClient = getQueryClient();

        if (accessToken) {
          setAuthCookie();
          queryClient?.clear();
          void fetchCapabilities()
            .then(setCapabilities)
            .catch(() => {
              useAuthStore.getState().clearAuth();
              clearAuthCookie();
              queryClient?.clear();
            });
        } else {
          clearAuthCookie();
          queryClient?.clear();
        }
      });
    };

    const handleStorage = (event: StorageEvent): void => {
      if (event.key === AUTH_PERSIST_KEY) {
        syncFromStorage();
      }
    };

    const handleBroadcast = (event: MessageEvent<{ event: AuthSessionEvent }>): void => {
      if (event.data?.event === 'signed-out') {
        syncFromStorage();
      }
    };

    window.addEventListener('storage', handleStorage);

    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(AUTH_SESSION_CHANNEL)
        : null;

    channel?.addEventListener('message', handleBroadcast);

    return () => {
      window.removeEventListener('storage', handleStorage);
      channel?.close();
    };
  }, []);

  return null;
}
