'use client';

import { useEffect, useState } from 'react';
import {
  AUTH_SESSION_CHANNEL,
  type AuthSessionEvent,
} from '@/lib/auth/auth-session-channel';
import { AUTH_PERSIST_KEY } from '@/stores/auth.store';
import { getQueryClient } from '@/lib/query/query-client-ref';
import { clearAuthCookie, setAuthCookie } from '@/lib/auth/session';
import { ApiRequestError } from '@/lib/api/errors';
import { useSessionCapabilities } from '@/lib/query/auth';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Loads session capabilities via TanStack Query (deduped + 60s staleTime).
 */
function SessionCapabilitiesSync({
  enabled,
}: {
  enabled: boolean;
}): null {
  const query = useSessionCapabilities(enabled);

  useEffect(() => {
    if (!enabled || !query.isError) {
      return;
    }
    // Sign out only when the session itself is gone (401 after the client's
    // refresh attempt). A 403 - e.g. MUST_CHANGE_PASSWORD on the forced
    // change-password screen - or a network error must not wipe the tokens,
    // or the very next request (changing the password) goes out unauthenticated.
    if (!(query.error instanceof ApiRequestError && query.error.status === 401)) {
      return;
    }
    useAuthStore.getState().clearAuth();
    clearAuthCookie();
    getQueryClient()?.clear();
  }, [enabled, query.isError, query.error]);

  return null;
}

/**
 * Keeps auth state and query cache aligned when another tab signs in or out.
 */
export function AuthSessionSync(): React.ReactNode {
  const [hydrated, setHydrated] = useState(false);
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionId = useAuthStore((state) => state.sessionId);
  // Until the password is changed the backend answers 403 to everything but
  // the change itself, so there are no capabilities to load.
  const mustChangePassword = useAuthStore(
    (state) => state.user?.mustChangePassword === true,
  );

  useEffect(() => {
    if (useAuthStore.getState().accessToken) {
      setHydrated(true);
      return;
    }

    void Promise.resolve(useAuthStore.persist.rehydrate()).then(() => {
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const syncSession = (): void => {
      void Promise.resolve(useAuthStore.persist.rehydrate()).then(() => {
        const token = useAuthStore.getState().accessToken;
        const queryClient = getQueryClient();

        if (token) {
          setAuthCookie();
        } else {
          clearAuthCookie();
          queryClient?.clear();
        }
      });
    };

    syncSession();

    const handleStorage = (event: StorageEvent): void => {
      if (event.key === AUTH_PERSIST_KEY) {
        syncSession();
      }
    };

    const handleBroadcast = (event: MessageEvent<{ event: AuthSessionEvent }>): void => {
      if (event.data?.event === 'signed-out') {
        // Ignore stale sign-out events when this tab has already signed in again.
        if (useAuthStore.getState().accessToken) {
          return;
        }
        syncSession();
        return;
      }

      if (event.data?.event === 'signed-in') {
        syncSession();
        getQueryClient()?.removeQueries({ queryKey: ['profile'] });
        getQueryClient()?.removeQueries({ queryKey: ['auth', 'capabilities'] });
        getQueryClient()?.removeQueries({ queryKey: ['notifications'] });
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
  }, [hydrated]);

  return (
    <SessionCapabilitiesSync
      enabled={
        hydrated &&
        Boolean(accessToken) &&
        Boolean(sessionId) &&
        !mustChangePassword
      }
    />
  );
}
