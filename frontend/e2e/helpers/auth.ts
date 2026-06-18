import type { Page } from '@playwright/test';

export async function loginAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[type="password"]').fill(password);

  const capabilityProbe = page.waitForResponse(
    (response) =>
      response.url().includes('/projects') &&
      response.request().method() === 'GET' &&
      response.ok(),
    { timeout: 30_000 },
  );

  await page.getByRole('button', { name: 'Sign in' }).click();
  await capabilityProbe.catch(() => undefined);
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');
}

export async function isBackendReachable(
  apiBaseUrl: string,
): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'invalid@company.local',
        password: 'wrong-password-1',
      }),
    });
    return response.status === 401 || response.status === 400;
  } catch {
    return false;
  }
}
