import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  PM_MODULE_COOKIE,
  SYSADMIN_COOKIE,
  shouldRedirectPmRoute,
} from '@/lib/auth/session';

describe('shouldRedirectPmRoute', () => {
  it('redirects non-admin when PM module cookie is off', () => {
    expect(
      shouldRedirectPmRoute({
        pathname: '/projects',
        pmModuleEnabled: false,
        isSystemAdministrator: false,
      }),
    ).toBe(true);
  });

  it('allows system administrator when PM is disabled', () => {
    expect(
      shouldRedirectPmRoute({
        pathname: '/review-inbox',
        pmModuleEnabled: false,
        isSystemAdministrator: true,
      }),
    ).toBe(false);
  });

  it('allows any user when PM is enabled', () => {
    expect(
      shouldRedirectPmRoute({
        pathname: '/projects/1/rfis',
        pmModuleEnabled: true,
        isSystemAdministrator: false,
      }),
    ).toBe(false);
  });

  it('ignores non-PM paths', () => {
    expect(
      shouldRedirectPmRoute({
        pathname: '/hr/expense-claims',
        pmModuleEnabled: false,
        isSystemAdministrator: false,
      }),
    ).toBe(false);
  });
});

describe('PM proxy cookies', () => {
  it('reads capability cookies from request', () => {
    const request = new NextRequest('http://localhost/projects', {
      headers: {
        cookie: `${PM_MODULE_COOKIE}=0; ${SYSADMIN_COOKIE}=1`,
      },
    });
    expect(request.cookies.get(PM_MODULE_COOKIE)?.value).toBe('0');
    expect(request.cookies.get(SYSADMIN_COOKIE)?.value).toBe('1');
  });
});
