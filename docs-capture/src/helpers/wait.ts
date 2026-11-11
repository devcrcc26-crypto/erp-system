import type { Page } from '@playwright/test';

/**
 * Wait until the app's common loading indicators are gone.
 * Uses Ant Design Spin / Skeleton and the ERP page skeleton class.
 */
export async function waitForPageSettled(
  page: Page,
  options?: { timeoutMs?: number },
): Promise<void> {
  const timeout = options?.timeoutMs ?? 30_000;

  await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => undefined);

  // DashboardAuthGate / HR layout large spin
  await page
    .locator('.ant-spin-spinning')
    .first()
    .waitFor({ state: 'hidden', timeout })
    .catch(() => undefined);

  await page
    .locator('.ant-skeleton-active')
    .first()
    .waitFor({ state: 'hidden', timeout: 10_000 })
    .catch(() => undefined);

  await page
    .locator('.erp-page-skeleton')
    .first()
    .waitFor({ state: 'hidden', timeout: 10_000 })
    .catch(() => undefined);

  // Brief network quiet — avoid fixed sleeps for the whole page
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}

export async function disableAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
}

export async function readPageTitle(page: Page): Promise<string> {
  const h1 = page.locator('h1').first();
  if (await h1.isVisible().catch(() => false)) {
    const text = (await h1.innerText()).trim();
    if (text) return text;
  }
  return page.title();
}
