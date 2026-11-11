import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { DOCS_ROLES, selectedRoleKeys, type DocsRoleKey } from './src/roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const baseURL = process.env.DOCS_BASE_URL ?? 'http://localhost:3000';

if (/prod|production|ccecc\.com|onrender\.com\/(?!.*staging)/i.test(baseURL)) {
  console.warn(
    `\n[docs-capture] WARNING: DOCS_BASE_URL looks like production: ${baseURL}\n` +
      `This tool must only run against STAGING with seeded fake data.\n`,
  );
}

const authDir = path.join(__dirname, '.auth');
const selected = selectedRoleKeys();

function storageStateFor(key: DocsRoleKey): string {
  const role = DOCS_ROLES.find((r) => r.key === key)!;
  return path.join(authDir, `${role.slug}.json`);
}

const captureProjects = selected.map((key) => {
  const role = DOCS_ROLES.find((r) => r.key === key)!;
  return {
    name: `capture-${role.slug}`,
    testMatch: [/pages\.spec\.ts/, /steppers\/.*\.spec\.ts/],
    dependencies: [`setup-${role.slug}`],
    use: {
      storageState: storageStateFor(key),
      viewport: { width: 1440, height: 900 },
    },
    metadata: { docsRoleKey: key },
  };
});

const setupProjects = selected.map((key) => {
  const role = DOCS_ROLES.find((r) => r.key === key)!;
  return {
    name: `setup-${role.slug}`,
    testMatch: /auth\.setup\.ts/,
    use: {
      viewport: { width: 1440, height: 900 },
    },
    metadata: { docsRoleKey: key },
  };
});

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 45 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: path.join(__dirname, 'out', '_playwright'),
  use: {
    baseURL,
    channel: 'chrome',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [...setupProjects, ...captureProjects],
});
