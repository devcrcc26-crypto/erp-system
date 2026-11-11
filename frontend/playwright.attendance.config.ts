import { defineConfig, devices } from '@playwright/test';

/**
 * Attendance E2E suite - runs against the deployed Vercel frontend.
 * Use: npx playwright test --config=playwright.attendance.config.ts
 *
 * Keeps the default playwright.config.ts (./e2e) unchanged.
 * Uses system Chrome (channel) to avoid Playwright browser download issues.
 */
export default defineConfig({
  testDir: './tests/attendance',
  timeout: 45_000,
  retries: 1,
  workers: 1,
  fullyParallel: false,
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    // Prefer local when available - Vercel deploy currently 404s review routes.
    // Override: PLAYWRIGHT_BASE_URL=https://erp-system-frontend-psi.vercel.app
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  outputDir: 'tests/attendance/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/attendance/playwright-report', open: 'never' }],
    ['json', { outputFile: 'tests/attendance/test-results.json' }],
  ],
});
