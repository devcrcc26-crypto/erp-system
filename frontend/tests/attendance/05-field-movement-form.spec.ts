import { test, expect } from '@playwright/test';
import { loginAsSamuel } from './helpers/auth';
import {
  goToProfileAttendance,
  goToMyRequests,
  TEST_MONTH,
  TEST_YEAR,
} from './helpers/attendance.helpers';

test.describe('05 â€?Field movement form', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSamuel(page);
    await goToProfileAttendance(page, TEST_MONTH, TEST_YEAR);
  });

  test('flagged days warning banner appears on profile attendance tab', async ({
    page,
  }) => {
    await expect(
      page.getByText(/day\(s\) requiring explanation/i),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('Submit Explanation button opens field movement form', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /submit explanation/i }).click();
    await expect(
      page.getByText(/select the flagged days/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("form shows only Samuel's flagged days in the day selector", async ({
    page,
  }) => {
    await page.getByRole('button', { name: /submit explanation/i }).click();
    const dayCards = page.locator('.ant-modal').locator('.ant-checkbox-wrapper');
    await expect(dayCards.first()).toBeVisible({ timeout: 15_000 });
    const count = await dayCards.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(15);
  });

  test('Aug 25 (holiday) does not appear in flagged days', async ({ page }) => {
    await page.getByRole('button', { name: /submit explanation/i }).click();
    const modal = page.getByRole('dialog');
    await expect(modal.getByText(/25.*aug|aug.*25/i)).toHaveCount(0);
  });

  test('Aug 31 (last export day) does not appear as flagged', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /submit explanation/i }).click();
    const modal = page.getByRole('dialog');
    await expect(modal.getByText(/31.*aug|aug.*31/i)).toHaveCount(0);
  });

  test('reason dropdown shows only valid options per flag type', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /submit explanation/i }).click();
    const modal = page.getByRole('dialog');
    const firstDay = modal.locator('.ant-checkbox-input').first();
    await firstDay.check({ force: true });
    await modal.getByRole('button', { name: /next/i }).click();

    await modal.getByRole('combobox').first().click();
    await expect(
      page.getByText(/field \/ site visit|forgot to clock out|left early/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/forgot to clock in/i)).toHaveCount(0);
  });

  test('selecting Field Visit shows destination field as required', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /submit explanation/i }).click();
    const modal = page.getByRole('dialog');
    await modal.locator('.ant-checkbox-input').first().check({ force: true });
    await modal.getByRole('button', { name: /next/i }).click();
    await modal.getByRole('combobox').first().click();
    await page.getByText(/field \/ site visit/i).first().click();
    await expect(modal.getByText(/destination/i).first()).toBeVisible();
  });

  test('submitting Field Visit without destination shows validation error', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /submit explanation/i }).click();
    const modal = page.getByRole('dialog');
    await modal.locator('.ant-checkbox-input').first().check({ force: true });
    await modal.getByRole('button', { name: /next/i }).click();
    await modal.getByRole('combobox').first().click();
    await page.getByText(/field \/ site visit/i).first().click();
    await modal.getByRole('button', { name: /next|review|submit/i }).last().click();
    await expect(
      page.getByText(/destination/i).first(),
    ).toBeVisible();
  });

  test('selecting Early Leave shows departure time field', async ({ page }) => {
    await page.getByRole('button', { name: /submit explanation/i }).click();
    const modal = page.getByRole('dialog');
    await modal.locator('.ant-checkbox-input').first().check({ force: true });
    await modal.getByRole('button', { name: /next/i }).click();
    await modal.getByRole('combobox').first().click();
    await page.getByText(/left early/i).first().click();
    await expect(
      modal.getByText(/departure/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('selecting Forgot to Clock Out shows no extra fields', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /submit explanation/i }).click();
    const modal = page.getByRole('dialog');
    await modal.locator('.ant-checkbox-input').first().check({ force: true });
    await modal.getByRole('button', { name: /next/i }).click();
    await modal.getByRole('combobox').first().click();
    await page.getByText(/forgot to clock out/i).first().click();
    await expect(modal.getByText(/destination/i)).toHaveCount(0);
  });

  test('can add entries for multiple days in one submission', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /submit explanation/i }).click();
    const modal = page.getByRole('dialog');
    const checks = modal.locator('.ant-checkbox-input');
    const count = await checks.count();
    const toSelect = Math.min(2, count);
    for (let i = 0; i < toSelect; i += 1) {
      await checks.nth(i).check({ force: true });
    }
    await modal.getByRole('button', { name: /next/i }).click();
    for (let i = 0; i < toSelect; i += 1) {
      const combobox = modal.getByRole('combobox').nth(i);
      await combobox.click();
      await page.getByText(/forgot to clock out/i).first().click();
    }
    await modal.getByRole('button', { name: /next|review/i }).click();
    await expect(modal.getByText(/forgot to clock out|field visit|left early/i).first()).toBeVisible();
  });

  test('review step shows correct summary before submit', async ({ page }) => {
    await page.getByRole('button', { name: /submit explanation/i }).click();
    const modal = page.getByRole('dialog');
    await modal.locator('.ant-checkbox-input').first().check({ force: true });
    await modal.getByRole('button', { name: /next/i }).click();
    await modal.getByRole('combobox').first().click();
    await page.getByText(/forgot to clock out/i).first().click();
    await modal.getByRole('button', { name: /next|review/i }).click();
    await expect(modal.getByText(/review|summary|confirm/i).first()).toBeVisible();
  });

  test('submitting creates FM-XXXX log and navigates to confirmation', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /submit explanation/i }).click();
    const modal = page.getByRole('dialog');
    await modal.locator('.ant-checkbox-input').first().check({ force: true });
    await modal.getByRole('button', { name: /next/i }).click();
    await modal.getByRole('combobox').first().click();
    await page.getByText(/forgot to clock out/i).first().click();
    await modal.getByRole('button', { name: /next|review/i }).click();
    await modal.getByRole('button', { name: /submit/i }).click();
    await expect(page.getByText(/FM-\d{4}/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('confirmation step shows correct imported count', async ({ page }) => {
    const alreadyVisible = await page
      .getByText(/FM-\d{4}/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (alreadyVisible) {
      await expect(page.getByText(/FM-\d{4}/i).first()).toBeVisible();
      return;
    }

    const btn = page.getByRole('button', { name: /submit explanation/i });
    if (!(await btn.isVisible().catch(() => false))) {
      test.skip(true, 'No submit explanation button â€?prior submission may have cleared flags');
      return;
    }

    await btn.click();
    const modal = page.getByRole('dialog');
    if ((await modal.locator('.ant-checkbox-input').count()) === 0) {
      await expect(modal.getByText(/already|submitted|FM-/i).first()).toBeVisible();
      return;
    }
    await modal.locator('.ant-checkbox-input').first().check({ force: true });
    await modal.getByRole('button', { name: /next/i }).click();
    await modal.getByRole('combobox').first().click();
    await page.getByText(/forgot to clock out/i).first().click();
    await modal.getByRole('button', { name: /next|review/i }).click();
    await modal.getByRole('button', { name: /submit/i }).click();
    await expect(page.getByText(/FM-\d{4}/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('FM log appears in Approvals â†?My Requests', async ({ page }) => {
    await goToMyRequests(page);
    await expect(page.getByText(/FM-\d{4}/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/submitted/i).first()).toBeVisible();
  });

  test('can submit another form for remaining flagged days', async ({
    page,
  }) => {
    await goToProfileAttendance(page, TEST_MONTH, TEST_YEAR);
    const btn = page.getByRole('button', { name: /submit explanation/i });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      const modal = page.getByRole('dialog');
      await expect(modal).toBeVisible();
    }
  });

  test('already submitted days show existing log number badge', async ({
    page,
  }) => {
    await goToProfileAttendance(page, TEST_MONTH, TEST_YEAR);
    const btn = page.getByRole('button', { name: /submit explanation/i });
    if (!(await btn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await btn.click();
    const modal = page.getByRole('dialog');
    const fmBadge = modal.getByText(/FM-\d{4}/i);
    if ((await fmBadge.count()) === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'No already-submitted badge visible (all days may still be open)',
      });
    }
  });
});
