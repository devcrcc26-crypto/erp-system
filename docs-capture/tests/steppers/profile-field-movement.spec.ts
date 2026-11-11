import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';
import {
  disableAnimations,
  waitForPageSettled,
} from '../../src/helpers/wait.js';
import {
  imageRelativePath,
  writeManifestRecord,
} from '../../src/helpers/manifest.js';
import { DOCS_ROLES, type DocsRoleKey } from '../../src/roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = path.join(__dirname, '../..', 'out');

function roleKeyFromProject(projectName: string): DocsRoleKey | null {
  const match = /^capture-(.+)$/.exec(projectName);
  if (!match) return null;
  return DOCS_ROLES.find((r) => r.slug === match[1])?.key ?? null;
}

/**
 * Profile field-movement wizard (Ant Design Modal + Steps).
 * Opens via [data-shot="profile-field-movement"] when the profile banner is shown.
 * If the trigger is absent (no flagged days), records a skip — does not fail.
 */
test('profile field-movement wizard', async ({ page }, testInfo) => {
  const roleKey = roleKeyFromProject(testInfo.project.name);
  if (!roleKey || testInfo.project.name.startsWith('setup-')) {
    test.skip();
    return;
  }
  const role = DOCS_ROLES.find((r) => r.key === roleKey)!;

  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await waitForPageSettled(page);
  await disableAnimations(page);

  const trigger = page.locator('[data-shot="profile-field-movement"]').first();
  if (!(await trigger.isVisible().catch(() => false))) {
    writeManifestRecord(role.slug, OUT_ROOT, 'stepper-skip__profile-field-movement', {
      role: role.label,
      kind: 'skipped',
      route: '/profile#field-movement',
      reason:
        'data-shot=profile-field-movement not visible (no flagged attendance days)',
      capturedAt: new Date().toISOString(),
    });
    return;
  }

  await trigger.click();
  const dialog = page.locator('[role="dialog"]').first();
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });

  for (let step = 0; step < 4; step += 1) {
    const stepTitle =
      (
        await dialog
          .locator('.ant-steps-item-active .ant-steps-item-title')
          .first()
          .innerText()
          .catch(() => `Step ${step + 1}`)
      ).trim() || `Step ${step + 1}`;

    const rel = imageRelativePath(
      'step',
      '/profile#field-movement',
      `${step}-${stepTitle}`,
    );
    await dialog.screenshot({
      path: path.join(OUT_ROOT, role.slug, rel),
    });
    writeManifestRecord(role.slug, OUT_ROOT, `step__profile-fm__${step}`, {
      role: role.label,
      kind: 'stepper-step',
      route: '/profile#field-movement',
      url: page.url(),
      title: stepTitle,
      descriptionKey: `/profile#field-movement#step-${step}`,
      image: rel,
      stepIndex: step,
      stepTitle,
      capturedAt: new Date().toISOString(),
    });

    if (step >= 2) {
      // Stop before Done / submit
      break;
    }
    const next = dialog.getByRole('button', { name: /^(next|continue)$/i }).first();
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await waitForPageSettled(page);
    } else {
      break;
    }
  }

  await page.keyboard.press('Escape');
});
