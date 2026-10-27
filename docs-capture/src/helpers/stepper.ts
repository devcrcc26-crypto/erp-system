import type { Page } from '@playwright/test';
import path from 'node:path';
import {
  disableAnimations,
  waitForPageSettled,
} from './wait.js';
import {
  imageRelativePath,
  writeManifestRecord,
} from './manifest.js';

export interface StepperCaptureOptions {
  page: Page;
  roleSlug: string;
  roleLabel: string;
  route: string;
  outRoot: string;
  /** Fill + advance each step; return false to stop early (e.g. cannot proceed). */
  fillStep: (page: Page, stepIndex: number) => Promise<void>;
  /** Max steps to walk (including review). */
  maxSteps: number;
  /** Stop before clicking the final Submit on the last step. */
  stopAtReview?: boolean;
}

/**
 * Walk an erp-stepper-form, screenshot each step, never submit irreversible creates.
 */
export async function captureStepper(options: StepperCaptureOptions): Promise<void> {
  const {
    page,
    roleSlug,
    roleLabel,
    route,
    outRoot,
    fillStep,
    maxSteps,
    stopAtReview = true,
  } = options;

  try {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeManifestRecord(roleSlug, outRoot, `stepper-skip__${route}`, {
      role: roleLabel,
      kind: 'skipped',
      route,
      reason: `navigation failed: ${message.slice(0, 300)}`,
      capturedAt: new Date().toISOString(),
    });
    return;
  }
  await waitForPageSettled(page);
  await disableAnimations(page);

  const form = page.locator('.erp-stepper-form').first();
  if (!(await form.isVisible().catch(() => false))) {
    writeManifestRecord(roleSlug, outRoot, `stepper-skip__${route}`, {
      role: roleLabel,
      kind: 'skipped',
      route,
      reason: 'erp-stepper-form not visible (no-access or wrong page)',
      capturedAt: new Date().toISOString(),
    });
    return;
  }

  for (let step = 0; step < maxSteps; step += 1) {
    await fillStep(page, step);
    await waitForPageSettled(page);

    const stepTitle =
      (
        await page
          .locator('.ant-steps-item-active .ant-steps-item-title')
          .first()
          .innerText()
          .catch(() => `Step ${step + 1}`)
      ).trim() || `Step ${step + 1}`;

    const rel = imageRelativePath('step', route, `${step}-${stepTitle}`);
    const abs = path.join(outRoot, roleSlug, rel);
    await page.screenshot({ path: abs, fullPage: true });

    writeManifestRecord(roleSlug, outRoot, `step__${route}__${step}`, {
      role: roleLabel,
      kind: 'stepper-step',
      route,
      url: page.url(),
      title: stepTitle,
      descriptionKey: `${route}#step-${step}`,
      image: rel,
      stepIndex: step,
      stepTitle,
      capturedAt: new Date().toISOString(),
    });

    const isLast = step >= maxSteps - 1;
    if (isLast && stopAtReview) {
      break;
    }

    const next = page.getByRole('button', { name: /^(next|continue)$/i }).first();
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await waitForPageSettled(page);
    } else {
      break;
    }
  }
}

/** Best-effort fill for Ant Design form fields that are visible on the current step. */
export async function fillVisibleTextInputs(
  page: Page,
  values: Record<string, string>,
): Promise<void> {
  for (const [label, value] of Object.entries(values)) {
    const field = page.getByLabel(new RegExp(label, 'i')).first();
    if (await field.isVisible().catch(() => false)) {
      await field.fill(value).catch(() => undefined);
    }
  }
}
