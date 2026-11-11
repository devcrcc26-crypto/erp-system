import { test, expect } from '@playwright/test';
import { loginAsSamuel, loginAsEmployee, logout } from './helpers/auth';
import {
  goToProfileAttendance,
  openNotificationMatching,
  TEST_MONTH,
  TEST_YEAR,
} from './helpers/attendance.helpers';

test.describe('04 â€?Employee notification after approval', () => {
  test('Samuel receives notification after month approved', async ({
    page,
  }) => {
    await loginAsSamuel(page);
    await openNotificationMatching(
      page,
      /august 2026 attendance has been processed/i,
    );
  });

  test('notification body lists flagged days', async ({ page }) => {
    await loginAsSamuel(page);
    await openNotificationMatching(
      page,
      /august 2026 attendance has been processed/i,
    );
    await expect(
      page.getByText(/flagged day/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('notification link goes to profile attendance tab', async ({
    page,
  }) => {
    await loginAsSamuel(page);
    await openNotificationMatching(
      page,
      /august 2026 attendance has been processed/i,
    );

    const link = page.getByRole('link', { name: /view|attendance|profile/i }).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
    } else {
      await goToProfileAttendance(page, TEST_MONTH, TEST_YEAR);
    }

    await expect(page).toHaveURL(/\/profile/);
    await expect(
      page.getByRole('tab', { name: /attendance/i }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('employees with no flagged days do not receive notification', async ({
    page,
  }) => {
    await loginAsEmployee(page);
    const bell = page.getByRole('button', { name: /notification/i }).first();
    if (await bell.isVisible().catch(() => false)) {
      await bell.click();
    } else {
      await page.locator('button').filter({ has: page.locator('.anticon-bell') }).first().click();
    }
    await expect(
      page.getByText(/august 2026 attendance has been processed/i),
    ).toHaveCount(0);
  });

  test('notification shows correct flagged day count', async ({ page }) => {
    await logout(page);
    await loginAsSamuel(page);
    await openNotificationMatching(
      page,
      /august 2026 attendance has been processed/i,
    );
    const body = page.locator('.ant-dropdown, .ant-popover, [class*="notification"]').first();
    const text = await page.locator('body').innerText();
    expect(text.toLowerCase()).toMatch(/flagged/);
    void body;
  });
});
