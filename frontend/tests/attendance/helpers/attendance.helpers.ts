import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const TEST_MONTH = 8; // August
export const TEST_YEAR = 2026;
export const TEST_MONTH_NAME = MONTH_NAMES[TEST_MONTH - 1];

export const TEST_FILE_PATH = path.resolve(
  __dirname,
  '../fixtures/August_Attendance__2_.xlsx',
);

export const REVIEW_URL = `/hr/attendance/review/${TEST_MONTH}/${TEST_YEAR}`;
export const ATTENDANCE_LIST_URL = '/hr/attendance';
export const FIELD_MOVEMENT_LIST_URL = '/hr/field-movement-logs';

/**
 * Selects month/year filters on the HR attendance list page.
 */
export async function selectAttendancePeriod(
  page: Page,
  month: number = TEST_MONTH,
  year: number = TEST_YEAR,
): Promise<void> {
  const monthSelect = page.getByLabel(/month/i).first();
  if (await monthSelect.isVisible().catch(() => false)) {
    await monthSelect.click();
    await page
      .getByRole('option', { name: new RegExp(MONTH_NAMES[month - 1], 'i') })
      .click();
  }

  const yearInput = page.getByLabel(/year/i).first();
  if (await yearInput.isVisible().catch(() => false)) {
    await yearInput.fill(String(year));
    await yearInput.blur();
  }

  await page.waitForTimeout(800);
}

/**
 * Opens the Import Attendance modal from the list page.
 */
export async function openImportModal(page: Page): Promise<void> {
  await page.getByRole('button', { name: /import attendance/i }).click();
  await expect(
    page.getByRole('dialog').filter({ hasText: /import attendance/i }),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Uploads the August fixture into the import modal dropzone.
 */
export async function uploadAttendanceFixture(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog').filter({ hasText: /import attendance/i });
  const fileInput = dialog.locator('input[type="file"]');
  await fileInput.setInputFiles(TEST_FILE_PATH);
}

/**
 * Waits until the import preview review step is visible.
 */
export async function waitForImportPreview(page: Page): Promise<void> {
  await expect(
    page.getByText(/needs review|matched|not matched/i).first(),
  ).toBeVisible({ timeout: 60_000 });
}

/**
 * Opens the profile Attendance tab (optionally with month/year query).
 */
export async function goToProfileAttendance(
  page: Page,
  month?: number,
  year?: number,
): Promise<void> {
  const params = new URLSearchParams();
  params.set('tab', 'attendance');
  if (month != null) {
    params.set('month', String(month));
  }
  if (year != null) {
    params.set('year', String(year));
  }
  await page.goto(`/profile?${params.toString()}`);
  await expect(page.getByRole('tab', { name: /attendance/i })).toBeVisible({
    timeout: 20_000,
  });
  const tab = page.getByRole('tab', { name: /attendance/i });
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
  }
}

/**
 * Opens daily logs drawer for the first matching employee row containing `name`.
 */
export async function openDailyLogsForEmployee(
  page: Page,
  employeeName: string | RegExp,
): Promise<void> {
  const row = page
    .locator('.ant-table-row')
    .filter({ hasText: employeeName })
    .first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: /view daily logs/i }).click();
  await expect(page.getByText(/daily logs/i).first()).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Returns a locator for an Ant Design collapse panel by its header text.
 */
export function collapsePanelByTitle(
  page: Page,
  title: RegExp | string,
): Locator {
  return page.locator('.ant-collapse-item').filter({ hasText: title }).first();
}

/**
 * Asserts a collapse panel is expanded (active).
 */
export async function expectCollapseExpanded(
  panel: Locator,
): Promise<void> {
  await expect(panel).toHaveClass(/ant-collapse-item-active/);
}

/**
 * Asserts a collapse panel is collapsed.
 */
export async function expectCollapseCollapsed(
  panel: Locator,
): Promise<void> {
  await expect(panel).not.toHaveClass(/ant-collapse-item-active/);
}

/**
 * Clicks the notification bell and opens the first matching notification.
 */
export async function openNotificationMatching(
  page: Page,
  subject: RegExp,
): Promise<void> {
  const bell = page
    .locator('button')
    .filter({ has: page.locator('.anticon-bell, [aria-label*="otification" i]') })
    .first();
  const bellFallback = page.getByRole('button', { name: /notification/i }).first();
  if (await bell.isVisible().catch(() => false)) {
    await bell.click();
  } else {
    await bellFallback.click();
  }
  await expect(page.getByText(subject).first()).toBeVisible({ timeout: 20_000 });
  await page.getByText(subject).first().click();
}

/**
 * Approvals inbox helpers.
 */
export async function goToPendingMyAction(page: Page): Promise<void> {
  await page.goto('/approvals');
  const pendingTab = page.getByRole('tab', { name: /pending my action/i });
  if (await pendingTab.isVisible().catch(() => false)) {
    await pendingTab.click();
  } else {
    const link = page.getByRole('link', { name: /pending my action/i });
    if (await link.isVisible().catch(() => false)) {
      await link.click();
    }
  }
}

export async function goToMyRequests(page: Page): Promise<void> {
  await page.goto('/approvals');
  const tab = page.getByRole('tab', { name: /my requests/i });
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
  } else {
    const link = page.getByRole('link', { name: /my requests/i });
    if (await link.isVisible().catch(() => false)) {
      await link.click();
    }
  }
}
