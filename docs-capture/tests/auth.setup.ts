import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as setup, expect } from '@playwright/test';
import {
  DOCS_ROLES,
  resolveRoleCredentials,
  type DocsRoleKey,
} from '../src/roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(__dirname, '..', '.auth');

function roleKeyFromProject(projectName: string): DocsRoleKey {
  const match = /^setup-(.+)$/.exec(projectName);
  if (!match) {
    throw new Error(`Unexpected setup project name: ${projectName}`);
  }
  const slug = match[1];
  const role = DOCS_ROLES.find((r) => r.slug === slug);
  if (!role) {
    throw new Error(`No docs role for setup slug: ${slug}`);
  }
  return role.key;
}

setup('authenticate', async ({ page }, testInfo) => {
  setup.setTimeout(3 * 60_000);

  const roleKey = roleKeyFromProject(testInfo.project.name);
  const role = DOCS_ROLES.find((r) => r.key === roleKey)!;
  const { identifier, password } = resolveRoleCredentials(roleKey);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login?from=%2F', { waitUntil: 'domcontentloaded' });

  // Ant Design wraps labels; autocomplete attrs are the stable hooks.
  const identifierField = page.locator('input[autocomplete="username"]').first();
  const passwordField = page.locator('input[autocomplete="current-password"]').first();
  await identifierField.waitFor({ state: 'visible', timeout: 60_000 });
  await identifierField.click();
  await identifierField.fill(identifier);
  await passwordField.click();
  await passwordField.fill(password);

  await expect(identifierField).toHaveValue(identifier);
  await expect(passwordField).toHaveValue(password);

  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/auth/login') &&
      response.request().method() === 'POST',
    { timeout: 60_000 },
  );

  await page.getByRole('button', { name: /^sign in$/i }).click();

  const response = await loginResponse.catch(() => null);
  if (response && !response.ok()) {
    throw new Error(
      `Login failed for ${role.label} (${identifier}): HTTP ${response.status()}`,
    );
  }
  if (!response) {
    throw new Error(
      `No /auth/login response for ${role.label} (${identifier}). ` +
        `Form may not have submitted (check Full name / Password fields).`,
    );
  }

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 60_000,
  });

  if (page.url().includes('/change-password')) {
    throw new Error(
      `Account "${identifier}" (${role.label}) landed on /change-password. ` +
        `Reset mustChangePassword in the staging seed before capturing docs. ` +
        `Refusing to change the password automatically.`,
    );
  }

  await expect(
    page.getByRole('button', { name: /open notifications|open profile/i }).first(),
  ).toBeVisible({ timeout: 60_000 });

  const out = path.join(authDir, `${role.slug}.json`);
  await page.context().storageState({ path: out });
});
