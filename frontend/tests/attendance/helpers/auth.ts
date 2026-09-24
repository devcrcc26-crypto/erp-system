import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const ATTENDANCE_USERS = {
  hrOfficer: {
    email: 'jinxia.dong@company.local',
    password: 'Admin@12345',
    name: 'Jinxia Dong',
  },
  employee: {
    email: 'demo.seed.designer@company.local',
    password: 'Admin@12345',
    name: 'Demo Designer',
  },
  supervisor: {
    email: 'xiaoming.li@company.local',
    password: 'Admin@12345',
    name: 'Xiaoming Li',
  },
  samuel: {
    email: 'samuel.hailemariam@company.local',
    password: 'Admin@12345',
    name: 'Samuel Hailemariam',
  },
} as const;

export type AttendanceUserKey = keyof typeof ATTENDANCE_USERS;

/**
 * Clears session storage and logs in with email/password.
 * Mirrors frontend/e2e/helpers/auth.ts, with stronger post-login readiness checks.
 */
export async function loginAs(
  page: Page,
  email: string,
  password: string,
  redirectTo = '/',
): Promise<void> {
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  const from = encodeURIComponent(redirectTo);
  await page.goto(`/login?from=${from}`);

  const emailField = page.getByLabel(/^email$/i).first();
  await emailField.waitFor({ state: 'visible', timeout: 30_000 });
  await emailField.fill(email);

  const passwordField = page.getByLabel(/^password$/i).first();
  await passwordField.fill(password);

  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/auth/login') &&
      response.request().method() === 'POST',
    { timeout: 45_000 },
  );

  await page.getByRole('button', { name: /^sign in$/i }).click();

  const response = await loginResponse.catch(() => null);
  if (response && !response.ok()) {
    throw new Error(
      `Login failed for ${email}: HTTP ${response.status()}`,
    );
  }

  await page.waitForURL(
    (url) => !url.pathname.startsWith('/login'),
    { timeout: 45_000 },
  );

  // Shell / session must be ready before navigating to gated routes
  await expect(
    page.getByRole('button', { name: /open notifications|open profile/i }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

export async function loginAsHrOfficer(page: Page): Promise<void> {
  await loginAs(
    page,
    ATTENDANCE_USERS.hrOfficer.email,
    ATTENDANCE_USERS.hrOfficer.password,
    '/hr/attendance',
  );
}

export async function loginAsEmployee(page: Page): Promise<void> {
  await loginAs(
    page,
    ATTENDANCE_USERS.employee.email,
    ATTENDANCE_USERS.employee.password,
    '/profile',
  );
}

export async function loginAsSupervisor(page: Page): Promise<void> {
  await loginAs(
    page,
    ATTENDANCE_USERS.supervisor.email,
    ATTENDANCE_USERS.supervisor.password,
    '/approvals',
  );
}

export async function loginAsSamuel(page: Page): Promise<void> {
  await loginAs(
    page,
    ATTENDANCE_USERS.samuel.email,
    ATTENDANCE_USERS.samuel.password,
    '/profile',
  );
}

/**
 * Logs out by clearing storage and returning to login.
 */
export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login');
}
