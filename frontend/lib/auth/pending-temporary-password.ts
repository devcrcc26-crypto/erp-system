/**
 * Hands the temporary / OTP password a user just signed in with to the forced
 * change-password screen, so they are not asked to type it again.
 *
 * Kept in memory and mirrored to sessionStorage so a soft remount of the
 * change-password route still sees it. Cleared after the password is changed
 * (or on sign-out). Never written to localStorage.
 */

const SESSION_KEY = 'erp.pendingTemporaryPassword';

let pending: string | null = null;

function readSession(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeSession(value: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (value) {
      window.sessionStorage.setItem(SESSION_KEY, value);
    } else {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // ignore quota / private-mode errors
  }
}

export function setPendingTemporaryPassword(password: string): void {
  pending = password;
  writeSession(password);
}

export function peekPendingTemporaryPassword(): string | null {
  if (pending) {
    return pending;
  }
  const fromSession = readSession();
  if (fromSession) {
    pending = fromSession;
  }
  return pending;
}

export function clearPendingTemporaryPassword(): void {
  pending = null;
  writeSession(null);
}
