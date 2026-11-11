import type { Page } from '@playwright/test';

export type AccessOutcome =
  | { kind: 'ok' }
  | { kind: 'no-access'; reason: string }
  | { kind: 'dead-session' }
  | { kind: 'bad-id'; reason: string };

const NO_ACCESS_PATTERNS = [
  /you do not have access to/i,
  /you do not have permission/i,
];

/**
 * Classify the current page after navigation.
 * Redirect to /login is a dead session (fail loudly upstream).
 */
export async function detectAccess(
  page: Page,
  requestedPath: string,
): Promise<AccessOutcome> {
  const url = new URL(page.url());
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const requested = requestedPath.replace(/\/+$/, '') || '/';

  if (path === '/login' || path.startsWith('/login')) {
    return { kind: 'dead-session' };
  }

  if (
    (path === '/approvals' || path === '/dashboard') &&
    path !== requested &&
    !requested.startsWith(path)
  ) {
    return {
      kind: 'no-access',
      reason: `redirected to ${path}`,
    };
  }

  const bodyText = await page.locator('body').innerText().catch(() => '');

  if (/project not found/i.test(bodyText)) {
    return { kind: 'bad-id', reason: 'Project not found' };
  }
  if (/unable to load project/i.test(bodyText)) {
    return { kind: 'bad-id', reason: 'Unable to load project' };
  }

  for (const pattern of NO_ACCESS_PATTERNS) {
    if (pattern.test(bodyText)) {
      const line =
        bodyText
          .split('\n')
          .map((l) => l.trim())
          .find((l) => pattern.test(l)) ?? 'access denied text';
      return { kind: 'no-access', reason: line };
    }
  }

  return { kind: 'ok' };
}
