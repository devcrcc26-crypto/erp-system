import { isPmAppRoute } from '@/lib/navigation/pm-app-routes';

export const AUTH_COOKIE_NAME = 'erp-authenticated';
export const PM_MODULE_COOKIE = 'erp-pm-module-enabled';
export const SYSADMIN_COOKIE = 'erp-sysadmin';

const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

/** Sets the middleware auth cookie after a successful login. */
export function setAuthCookie(): void {
  writeCookie(AUTH_COOKIE_NAME, '1', ONE_WEEK_SECONDS);
}

/** Mirrors session capability flags for edge middleware (PM route gate). */
export function syncCapabilityCookies(options: {
  pmModuleEnabled: boolean;
  isSystemAdministrator: boolean;
}): void {
  writeCookie(PM_MODULE_COOKIE, options.pmModuleEnabled ? '1' : '0', ONE_WEEK_SECONDS);
  writeCookie(SYSADMIN_COOKIE, options.isSystemAdministrator ? '1' : '0', ONE_WEEK_SECONDS);
}

/** Clears the middleware auth cookie on logout. */
export function clearAuthCookie(): void {
  writeCookie(AUTH_COOKIE_NAME, '', 0);
  writeCookie(PM_MODULE_COOKIE, '', 0);
  writeCookie(SYSADMIN_COOKIE, '', 0);
}

export function shouldRedirectPmRoute(options: {
  pathname: string;
  pmModuleEnabled: boolean;
  isSystemAdministrator: boolean;
}): boolean {
  if (!isPmAppRoute(options.pathname)) {
    return false;
  }
  if (options.pmModuleEnabled || options.isSystemAdministrator) {
    return false;
  }
  return true;
}
