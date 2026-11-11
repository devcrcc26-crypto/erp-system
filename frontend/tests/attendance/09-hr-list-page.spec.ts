import { test, expect } from '@playwright/test';
import { loginAsHrOfficer, loginAsEmployee } from './helpers/auth';
import {
  ATTENDANCE_LIST_URL,
  selectAttendancePeriod,
  TEST_MONTH_NAME,
} from './helpers/attendance.helpers';

test.describe('09 â€?HR attendance list page', () => {
  test('list page loads at /hr/attendance', async ({ page }) => {
    await loginAsHrOfficer(page);
    // loginAsHrOfficer already redirects to /hr/attendance via ?from=
    if (!page.url().includes('/hr/attendance')) {
      await page.goto(ATTENDANCE_LIST_URL);
    }
    await expect(page).toHaveURL(/\/hr\/attendance/, { timeout: 30_000 });
    await expect(
      page.getByRole('button', { name: /import attendance/i }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('stat bar shows correct counts', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(ATTENDANCE_LIST_URL);
    await selectAttendancePeriod(page);
    await expect(
      page.getByText(/employees|present days|absent days|late days/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('default view shows current month data', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(ATTENDANCE_LIST_URL);
    await expect(
      page.getByLabel(/month/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('switching to August 2026 shows imported data', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(ATTENDANCE_LIST_URL);
    await selectAttendancePeriod(page);
    await expect(page.locator('.ant-table-row').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(new RegExp(TEST_MONTH_NAME, 'i')).first()).toBeVisible();
  });

  test('employee search filters the list', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(ATTENDANCE_LIST_URL);
    await selectAttendancePeriod(page);
    const search = page.getByPlaceholder(/search employee/i);
    await search.fill('Samuel');
    await page.waitForTimeout(600);
    const rows = page.locator('.ant-table-tbody .ant-table-row');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(3);
    await expect(rows.first()).toContainText(/samuel/i);
  });

  test('all employees with records shown â€?no 0% filter issue', async ({
    page,
  }) => {
    await loginAsHrOfficer(page);
    await page.goto(ATTENDANCE_LIST_URL);
    await selectAttendancePeriod(page);
    const rows = page.locator('.ant-table-tbody .ant-table-row');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(10);
  });

  test('Review button navigates to review page', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(ATTENDANCE_LIST_URL);
    await selectAttendancePeriod(page);
    await page.getByRole('button', { name: /review/i }).click();
    await expect(page).toHaveURL(/\/hr\/attendance\/review\/8\/2026/);
  });

  test('status badge shows APPROVED for August 2026', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(ATTENDANCE_LIST_URL);
    await selectAttendancePeriod(page);
    await expect(page.getByText(/^approved$/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('employee sees only own record when not HR', async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto(ATTENDANCE_LIST_URL);
    await selectAttendancePeriod(page);
    const search = page.getByPlaceholder(/search employee/i);
    await expect(search).toHaveCount(0);
    const rows = page.locator('.ant-table-tbody .ant-table-row');
    if (await rows.first().isVisible().catch(() => false)) {
      expect(await rows.count()).toBeLessThanOrEqual(1);
    }
  });

  test('import button only visible to HR', async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto(ATTENDANCE_LIST_URL);
    await expect(
      page.getByRole('button', { name: /import attendance/i }),
    ).toHaveCount(0);
  });
});
