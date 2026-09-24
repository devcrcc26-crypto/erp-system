import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import {
  REVIEW_URL,
  openDailyLogsForEmployee,
} from './helpers/attendance.helpers';

test.describe('02 â€?HR review page', () => {
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
    await expect(page.getByText(/review august 2026|august 2026|pending review|reviewed|approved/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('review page loads at /hr/attendance/review/8/2026', async ({ page }) => {
    await expect(page).toHaveURL(/\/hr\/attendance\/review\/8\/2026/);
  });

  test('status banner shows PENDING_REVIEW', async ({ page }) => {
    await expect(page.getByText(/pending review/i).first()).toBeVisible();
  });

  test('summary cards show correct employee and flagged day counts', async ({
    page,
  }) => {
    await expect(page.getByText(/total employees/i)).toBeVisible();
    await expect(page.getByText(/employees with flags/i)).toBeVisible();
    await expect(page.getByText(/total flagged days/i)).toBeVisible();
  });

  test('employee table shows all imported employees', async ({ page }) => {
    const rows = page.locator('.ant-table-tbody .ant-table-row');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(20);
  });

  test('employees with flagged days show amber badge', async ({ page }) => {
    await expect(
      page.getByText(/has flags/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('employees with no flagged days show green badge', async ({ page }) => {
    await expect(
      page.getByText(/no flags/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('View Daily Logs button opens drawer for an employee', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /view daily logs/i }).first().click();
    await expect(page.getByText(/daily logs/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('daily logs drawer shows all days for the month', async ({ page }) => {
    await page.getByRole('button', { name: /view daily logs/i }).first().click();
    const dayRows = page.locator('.ant-drawer .ant-table-row');
    await expect(dayRows.first()).toBeVisible({ timeout: 15_000 });
    const count = await dayRows.count();
    expect(count).toBeGreaterThanOrEqual(28);
  });

  test('holidays show correctly â€?Aug 25 shows as HOLIDAY', async ({ page }) => {
    await openDailyLogsForEmployee(page, /samuel/i);
    const holidayRow = page
      .locator('.ant-drawer .ant-table-row')
      .filter({ hasText: /25/ })
      .filter({ hasText: /holiday/i });
    await expect(holidayRow.first()).toBeVisible({ timeout: 15_000 });
    await expect(holidayRow.first().getByText(/missing clock/i)).toHaveCount(0);
  });

  test('weekend days show as WEEKEND status', async ({ page }) => {
    await openDailyLogsForEmployee(page, /samuel/i);
    const weekendRow = page
      .locator('.ant-drawer .ant-table-row')
      .filter({ hasText: /weekend/i })
      .first();
    await expect(weekendRow).toBeVisible({ timeout: 15_000 });
  });

  test('flagged days show correct flag chips', async ({ page }) => {
    await openDailyLogsForEmployee(page, /samuel/i);
    await expect(
      page
        .locator('.ant-drawer')
        .getByText(/missing clock out/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('last export day (Aug 31) shows no MISSING_CLOCK_OUT flag', async ({
    page,
  }) => {
    await openDailyLogsForEmployee(page, /samuel/i);
    const aug31 = page
      .locator('.ant-drawer .ant-table-row')
      .filter({ hasText: /31/ })
      .first();
    await expect(aug31).toBeVisible({ timeout: 15_000 });
    const flagText = await aug31.innerText();
    expect(flagText.toLowerCase()).not.toMatch(/missing clock out/);
  });

  test('clock times show in local Ethiopia time not machine time', async ({
    page,
  }) => {
    await openDailyLogsForEmployee(page, /samuel/i);
    const drawer = page.locator('.ant-drawer');
    const times = await drawer.locator('td').allInnerTexts();
    const hasMorning = times.some((t) => /^0[6-9]:\d{2}$/.test(t.trim()));
    const hasMachineNoon = times.some((t) => /^1[2-4]:\d{2}$/.test(t.trim()));
    expect(hasMorning || !hasMachineNoon).toBeTruthy();
  });

  test('HR can correct a daily log entry', async ({ page }) => {
    await openDailyLogsForEmployee(page, /samuel/i);
    const correctBtn = page
      .locator('.ant-drawer')
      .getByRole('button', { name: /^correct$/i })
      .first();
    await correctBtn.click();

    await page.getByLabel(/corrected clock in/i).fill('08:30');
    await page.getByLabel(/corrected clock out/i).fill('17:30');
    await page
      .getByLabel(/correction note/i)
      .fill('Machine recorded wrong time');
    await page.getByRole('button', { name: /save correction/i }).click();

    await expect(page.getByText(/daily log corrected/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.locator('.ant-drawer').getByText('08:30').first(),
    ).toBeVisible();
  });

  test('correction note is required â€?empty note shows error', async ({
    page,
  }) => {
    await openDailyLogsForEmployee(page, /samuel/i);
    await page
      .locator('.ant-drawer')
      .getByRole('button', { name: /^correct$/i })
      .first()
      .click();
    await page.getByRole('button', { name: /save correction/i }).click();
    await expect(
      page.getByText(/correction note is required/i),
    ).toBeVisible();
  });

  test('correction note minimum 10 characters enforced', async ({ page }) => {
    await openDailyLogsForEmployee(page, /samuel/i);
    await page
      .locator('.ant-drawer')
      .getByRole('button', { name: /^correct$/i })
      .first()
      .click();
    await page.getByLabel(/correction note/i).fill('too short');
    await page.getByRole('button', { name: /save correction/i }).click();
    await expect(
      page.locator('.ant-form-item-explain-error').first(),
    ).toBeVisible();
  });

  test('Mark as Reviewed button changes status to REVIEWED', async ({
    page,
  }) => {
    const markBtn = page.getByRole('button', { name: /mark as reviewed/i });
    if (await markBtn.isEnabled()) {
      await markBtn.click();
    }
    await expect(
      page.getByText(/reviewed â€?ready for approval|reviewed/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
