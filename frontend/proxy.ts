import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  PM_MODULE_COOKIE,
  SYSADMIN_COOKIE,
  shouldRedirectPmRoute,
} from '@/lib/auth/session';

const PUBLIC_PATHS = [
  '/login',
  '/activate',
  '/forgot-password',
  '/reset-password',
  '/confirm-email-change',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function hasExplicitLoginIntent(searchParams: URLSearchParams): boolean {
  return (
    searchParams.get('activated') === '1' ||
    searchParams.get('reset') === '1' ||
    searchParams.get('emailChanged') === '1'
  );
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isAuthenticated =
    request.cookies.get(AUTH_COOKIE_NAME)?.value === '1';
  const isPublic = isPublicPath(pathname);

  if (!isAuthenticated && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    isAuthenticated &&
    pathname === '/login' &&
    !hasExplicitLoginIntent(request.nextUrl.searchParams)
  ) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (isAuthenticated) {
    const pmModuleEnabled =
      request.cookies.get(PM_MODULE_COOKIE)?.value === '1';
    const isSystemAdministrator =
      request.cookies.get(SYSADMIN_COOKIE)?.value === '1';
    if (
      shouldRedirectPmRoute({
        pathname,
        pmModuleEnabled,
        isSystemAdministrator,
      })
    ) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
