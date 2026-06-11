export const AUTH_COOKIE_NAME = 'erp-authenticated';

const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;

/** Sets the middleware auth cookie after a successful login. */
export function setAuthCookie(): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${AUTH_COOKIE_NAME}=1; path=/; max-age=${ONE_WEEK_SECONDS}; SameSite=Lax`;
}

/** Clears the middleware auth cookie on logout. */
export function clearAuthCookie(): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}
