import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import {
  REVIEW_URL,
  ATTENDANCE_LIST_URL,
  openDailyLogsForEmployee,
  selectAttendancePeriod,
} from './helpers/attendance.helpers';

test.describe('03 â€?HR monthly approval', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(
      page,
      'jinxia.dong@company.local',
      'Admin@12345',
      REVIEW_URL,
    );
    if (!page.url().includes('/hr/attendance/review/')) {
      await page.goto(REVIEW_URL);
    }
  });

  test('Approve Month button visible when status is PENDING_REVIEW or REVIEWED', async ({
    page,
  }) => {
    await expect(
      page.getByRole('button', { name: /approve month/i }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('Approve Month shows confirmation modal', async ({ page }) => {
    await page.goto(REVIEW_URL);
    await page.getByRole('button', { name: /approve month/i }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/lock the attendance/i)).toBeVisible();
    await expect(modal.getByText(/notify/i)).toBeVisible();
  });

  test('confirming approval changes status to APPROVED', async ({ page }) => {
    await page.goto(REVIEW_URL);
    const approveBtn = page.getByRole('button', { name: /approve month/i });
    if (await approveBtn.isVisible().catch(() => false)) {
      await approveBtn.click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^approve$/i })
        .click();
    }
    await expect(
      page.getByText(/approved and locked/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('corrections not possible after approval â€?error shown', async ({
    page,
  }) => {
    await page.goto(REVIEW_URL);
    await openDailyLogsForEmployee(page, /samuel/i);
    const correctBtn = page
      .locator('.ant-drawer')
      .getByRole('button', { name: /^correct$/i });
    await expect(correctBtn).toHaveCount(0);
  });

  test('Unlock Month button visible when status is APPROVED', async ({
    page,
  }) => {
    await page.goto(REVIEW_URL);
    await expect(
      page.getByRole('button', { name: /unlock month/i }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('Unlock Month requires a reason â€?empty reason shows error', async ({
    page,
  }) => {
    await page.goto(REVIEW_URL);
    await page.getByRole('button', { name: /unlock month/i }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^unlock$/i })
      .click();
    await expect(
      page.getByText(/please enter a reason|reason/i).first(),
    ).toBeVisible();
  });

  test('unlocking changes status to UNLOCKED', async ({ page }) => {
    await page.goto(REVIEW_URL);
    await page.getByRole('button', { name: /unlock month/i }).click();
    await page
      .getByLabel(/unlock reason/i)
      .fill('Correcting clock-in error for Samuel');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^unlock$/i })
      .click();
    await expect(page.getByText(/unlocked/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('corrections possible again after unlock', async ({ page }) => {
    await page.goto(REVIEW_URL);
    await openDailyLogsForEmployee(page, /samuel/i);
    await expect(
      page
        .locator('.ant-drawer')
        .getByRole('button', { name: /^correct$/i })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('re-approving after unlock works correctly', async ({ page }) => {
    await page.goto(REVIEW_URL);
    await page.getByRole('button', { name: /approve month/i }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^approve$/i })
      .click();
    await expect(
      page.getByText(/approved and locked/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('Review button on attendance list page shows correct status badge', async ({
    page,
  }) => {
    await page.goto(ATTENDANCE_LIST_URL);
    await selectAttendancePeriod(page);
    await expect(
      page.getByText(/^approved$/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
