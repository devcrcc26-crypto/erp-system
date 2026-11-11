export const AUTH_SESSION_CHANNEL = 'erp-auth-sync';

export type AuthSessionEvent = 'signed-out' | 'signed-in';

/** Notifies other tabs that the auth session changed. */
export function broadcastAuthSessionChange(event: AuthSessionEvent): void {
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  const channel = new BroadcastChannel(AUTH_SESSION_CHANNEL);
  channel.postMessage({ event });
  channel.close();
}
