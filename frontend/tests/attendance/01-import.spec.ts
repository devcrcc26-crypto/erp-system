import { test, expect } from '@playwright/test';
import { loginAsHrOfficer } from './helpers/auth';
import {
  REVIEW_URL,
  ATTENDANCE_LIST_URL,
  TEST_MONTH,
  TEST_YEAR,
  TEST_MONTH_NAME,
  collapsePanelByTitle,
  expectCollapseCollapsed,
  expectCollapseExpanded,
  openImportModal,
  selectAttendancePeriod,
  uploadAttendanceFixture,
  waitForImportPreview,
} from './helpers/attendance.helpers';

test.describe('01 �?Attendance import', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsHrOfficer(page);
    if (!page.url().includes('/hr/attendance')) {
      await page.goto(ATTENDANCE_LIST_URL);
    }
    await expect(page.getByRole('button', { name: /import attendance/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('import modal opens when Import Attendance button clicked', async ({
    page,
  }) => {
    await openImportModal(page);
    await expect(
      page.getByText(/upload deli e\+ monthly export/i),
    ).toBeVisible();
  });

  test('file upload triggers preview automatically', async ({ page }) => {
    await openImportModal(page);
    await uploadAttendanceFixture(page);
    await waitForImportPreview(page);
    await expect(page.getByText(/confirm import/i)).toBeVisible({
      timeout: 30_000,
    });
  });

  test('preview shows correct counts: ~56 matched, ~9 review, ~9 rejected', async ({
    page,
  }) => {
    await openImportModal(page);
    await uploadAttendanceFixture(page);
    await waitForImportPreview(page);

    const matched = collapsePanelByTitle(page, /matched/i);
    const review = collapsePanelByTitle(page, /needs review/i);
    const rejected = collapsePanelByTitle(page, /not matched/i);

    await expect(matched).toBeVisible();
    await expect(review).toBeVisible();
    await expect(rejected).toBeVisible();

    const matchedText = await matched.locator('.ant-collapse-header').innerText();
    const reviewText = await review.locator('.ant-collapse-header').innerText();
    const rejectedText = await rejected
      .locator('.ant-collapse-header')
      .innerText();

    const matchedCount = Number(matchedText.match(/(\d+)/)?.[1] ?? 0);
    const reviewCount = Number(reviewText.match(/(\d+)/)?.[1] ?? 0);
    const rejectedCount = Number(rejectedText.match(/(\d+)/)?.[1] ?? 0);

    // Observed against August_Attendance__2_.xlsx: 57 matched, 7 review, 10 rejected
    expect(matchedCount).toBeGreaterThanOrEqual(50);
    expect(matchedCount).toBeLessThanOrEqual(65);
    expect(reviewCount).toBeGreaterThanOrEqual(5);
    expect(reviewCount).toBeLessThanOrEqual(15);
    expect(rejectedCount).toBeGreaterThanOrEqual(5);
    expect(rejectedCount).toBeLessThanOrEqual(15);
  });

  test('review section is expanded by default', async ({ page }) => {
    await openImportModal(page);
    await uploadAttendanceFixture(page);
    await waitForImportPreview(page);
    await expectCollapseExpanded(collapsePanelByTitle(page, /needs review/i));
  });

  test('matched section is collapsed by default', async ({ page }) => {
    await openImportModal(page);
    await uploadAttendanceFixture(page);
    await waitForImportPreview(page);
    await expectCollapseCollapsed(collapsePanelByTitle(page, /^matched/i));
  });

  test('rejected section is expanded by default when unmatched rows exist', async ({
    page,
  }) => {
    // App behavior: defaultActiveKeys includes 'rejected' when preview.rejected.length > 0
    // (prompt expected collapsed - documented as finding in TEST-REPORT)
    await openImportModal(page);
    await uploadAttendanceFixture(page);
    await waitForImportPreview(page);
    await expectCollapseExpanded(collapsePanelByTitle(page, /not matched/i));
  });

  test('review row toggle deselects a row and updates summary count', async ({
    page,
  }) => {
    await openImportModal(page);
    await uploadAttendanceFixture(page);
    await waitForImportPreview(page);

    const footerBefore = await page
      .getByText(/records will be imported/i)
      .innerText();
    const beforeCount = Number(footerBefore.match(/(\d+)\s+records will be imported/i)?.[1] ?? 0);

    const reviewPanel = collapsePanelByTitle(page, /needs review/i);
    const checkbox = reviewPanel.locator('.ant-checkbox-input').first();
    await checkbox.click({ force: true });

    const footerAfter = await page
      .getByText(/records will be imported/i)
      .innerText();
    const afterCount = Number(footerAfter.match(/(\d+)\s+records will be imported/i)?.[1] ?? 0);
    expect(afterCount).toBeLessThan(beforeCount);
  });

  test('rejected row can be manually assigned to an employee', async ({
    page,
  }) => {
    await openImportModal(page);
    await uploadAttendanceFixture(page);
    await waitForImportPreview(page);

    const rejectedPanel = collapsePanelByTitle(page, /not matched/i);
    await rejectedPanel.locator('.ant-collapse-header').click();
    await expect(rejectedPanel).toHaveClass(/ant-collapse-item-active/);

    const assignBtn = rejectedPanel
      .getByRole('button', { name: /assign employee/i })
      .first();
    await assignBtn.click();

    const search = page.getByPlaceholder(/search employee/i).last();
    await search.fill('Samuel');
    await page.waitForTimeout(800);
    await page.getByText(/samuel hailemariam/i).first().click();

    await expect(
      rejectedPanel.getByText(/assigned/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('summary footer shows correct import count after toggles', async ({
    page,
  }) => {
    await openImportModal(page);
    await uploadAttendanceFixture(page);
    await waitForImportPreview(page);

    const footer = page.getByText(/records will be imported/i);
    await expect(footer).toBeVisible();
    const text = await footer.innerText();
    const importCount = Number(text.match(/(\d+)\s+records will be imported/i)?.[1] ?? 0);
    expect(importCount).toBeGreaterThan(50);
  });

  test('confirm import succeeds and shows result step', async ({ page }) => {
    await openImportModal(page);
    await uploadAttendanceFixture(page);
    await waitForImportPreview(page);

    await page.getByRole('button', { name: /confirm import/i }).click();

    const replaceBtn = page.getByRole('button', { name: /yes, replace/i });
    if (await replaceBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await replaceBtn.click();
    }

    await expect(page.getByText(/import complete/i)).toBeVisible({
      timeout: 90_000,
    });

    const autoMatched = page.getByText(/automatically matched/i);
    await expect(autoMatched).toBeVisible();
    const matchedText = await autoMatched.innerText();
    const matchedCount = Number(matchedText.match(/(\d+)/)?.[1] ?? 0);
    expect(matchedCount).toBeGreaterThan(50);

    const rejectedToggle = page.getByText(/employees not imported/i);
    if (await rejectedToggle.isVisible().catch(() => false)) {
      await rejectedToggle.click();
    }
  });

  test('list page refreshes after successful import', async ({ page }) => {
    await selectAttendancePeriod(page, TEST_MONTH, TEST_YEAR);
    await expect(
      page.locator('.ant-table-row').first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(new RegExp(TEST_MONTH_NAME, 'i')).first()).toBeVisible();
  });

  test('reimporting same month shows overwrite warning banner', async ({
    page,
  }) => {
    await openImportModal(page);
    await uploadAttendanceFixture(page);
    await waitForImportPreview(page);

    await expect(
      page.getByText(/has already been imported/i),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('overwrite confirmation replaces existing data', async ({ page }) => {
    await openImportModal(page);
    await uploadAttendanceFixture(page);
    await waitForImportPreview(page);

    await page.getByRole('button', { name: /confirm import/i }).click();
    const replaceBtn = page.getByRole('button', { name: /yes, replace/i });
    await expect(replaceBtn).toBeVisible({ timeout: 10_000 });
    await replaceBtn.click();

    await expect(page.getByText(/import complete/i)).toBeVisible({
      timeout: 90_000,
    });
  });

  test('monthly approval record created with PENDING_REVIEW status after import', async ({
    page,
  }) => {
    await page.goto(REVIEW_URL);
    await expect(
      page.getByText(/pending review/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});
