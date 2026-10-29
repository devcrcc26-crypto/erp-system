import { useAuthStore } from '@/stores/auth.store';
import { getQueryClient } from '@/lib/query/query-client-ref';
import { broadcastAuthSessionChange } from '@/lib/auth/auth-session-channel';
import { clearAuthCookie, setAuthCookie } from '@/lib/auth/session';
import { clearPendingTemporaryPassword } from '@/lib/auth/pending-temporary-password';
import { profileKeys } from '@/lib/query/profile';

interface SignOutLocallyOptions {
  broadcast?: boolean;
  clearQuery?: boolean;
}

/** Clears client auth state without calling the logout API. */
export function signOutLocally(options?: SignOutLocallyOptions): void {
  const { broadcast = true, clearQuery = true } = options ?? {};

  useAuthStore.getState().clearAuth();
  clearAuthCookie();
  clearPendingTemporaryPassword();

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.clear();
    } catch {
      // ignore quota / private-mode errors
    }
    try {
      window.localStorage.removeItem('erp-auth');
      window.localStorage.removeItem('session');
    } catch {
      // ignore
    }
  }

  if (clearQuery) {
    getQueryClient()?.clear();
  }

  if (broadcast) {
    broadcastAuthSessionChange('signed-out');
  }
}

/** Marks the client as authenticated after a successful login. */
export function completeLocalSignIn(): void {
  setAuthCookie();

  const queryClient = getQueryClient();
  if (queryClient) {
    void queryClient.removeQueries({ queryKey: profileKeys.all });
    void queryClient.removeQueries({ queryKey: ['auth', 'capabilities'] });
    // Prevent previous-session inbox rows from briefly appearing for the new user.
    void queryClient.removeQueries({ queryKey: ['notifications'] });
  }

  broadcastAuthSessionChange('signed-in');
}
