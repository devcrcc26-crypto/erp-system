import type { Page } from '@playwright/test';

export async function loginAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  });
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
