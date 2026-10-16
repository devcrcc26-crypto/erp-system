/**
 * Hands the temporary password a user just signed in with to the forced
 * change-password screen, so they are not asked to type it again (and a
 * browser-autofilled "current password" cannot get in the way).
 *
 * Memory only - never persisted. Cleared after the password is changed (or
 * rejected); a page reload loses it and the screen falls back to asking for
 * the current password. Reading does not clear it, so React StrictMode's
 * double-invoked initialisers see the same value.
 */
let pending: string | null = null;

export function setPendingTemporaryPassword(password: string): void {
  pending = password;
}

export function peekPendingTemporaryPassword(): string | null {
  return pending;
}

export function clearPendingTemporaryPassword(): void {
  pending = null;
}
