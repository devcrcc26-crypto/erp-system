import type { Page, Locator } from '@playwright/test';
import path from 'node:path';
import {
  imageRelativePath,
  writeManifestRecord,
  type ManifestRecord,
} from './manifest.js';

function dialogLocator(page: Page): Locator {
  return page.locator('[role="dialog"], .ant-drawer-open .ant-drawer-content').first();
}

/**
 * Click every [data-shot] on the page, screenshot the dialog/drawer, close with Escape.
 * Failures are recorded; they never fail the whole page capture.
 */
export async function captureDataShotModals(options: {
  page: Page;
  roleSlug: string;
  roleLabel: string;
  route: string;
  outRoot: string;
}): Promise<string[]> {
  const { page, roleSlug, roleLabel, route, outRoot } = options;
  const failures: string[] = [];
  const triggers = page.locator('[data-shot]');
  const count = await triggers.count();

  for (let i = 0; i < count; i += 1) {
    const trigger = triggers.nth(i);
    const name = (await trigger.getAttribute('data-shot')) ?? `shot-${i}`;
    try {
      if (!(await trigger.isVisible())) {
        continue;
      }
      await trigger.click({ timeout: 5_000 });
      const dialog = dialogLocator(page);
      await dialog.waitFor({ state: 'visible', timeout: 8_000 });

      const rel = imageRelativePath('modal', route, name);
      const abs = path.join(outRoot, roleSlug, rel);
      await dialog.screenshot({ path: abs });

      const record: ManifestRecord = {
        role: roleLabel,
        kind: 'modal',
        route,
        url: page.url(),
        title: name,
        descriptionKey: `${route}#${name}`,
        image: rel,
        modalName: name,
        capturedAt: new Date().toISOString(),
      };
      writeManifestRecord(roleSlug, outRoot, `${route}__modal-${name}`, record);

      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
      // If still open, try clicking mask / close
      if (await dialog.isVisible().catch(() => false)) {
        await page.locator('.ant-modal-close, .ant-drawer-close').first().click({ timeout: 2_000 }).catch(() => undefined);
        await page.keyboard.press('Escape');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(name);
      writeManifestRecord(roleSlug, outRoot, `${route}__modal-fail-${name}`, {
        role: roleLabel,
        kind: 'failed-modal',
        route,
        url: page.url(),
        modalName: name,
        reason: message.slice(0, 500),
        capturedAt: new Date().toISOString(),
      });
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  }

  return failures;
}
