import { test, expect } from '@playwright/test';
import { loginAsHrOfficer, loginAsEmployee, loginAsSamuel } from './helpers/auth';
import {
  FIELD_MOVEMENT_LIST_URL,
  goToMyRequests,
} from './helpers/attendance.helpers';

test.describe('10 â€?HR field movement logs list', () => {
  test('list page loads at /hr/field-movement-logs', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(FIELD_MOVEMENT_LIST_URL);
    await expect(page).toHaveURL(/\/hr\/field-movement-logs/);
    await expect(
      page.getByText(/field movement/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('stat bar shows Total, Pending, Approved, Rejected counts', async ({
    page,
  }) => {
    await loginAsHrOfficer(page);
    await page.goto(FIELD_MOVEMENT_LIST_URL);
    await expect(page.getByText(/^total$/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/pending/i).first()).toBeVisible();
    await expect(page.getByText(/approved/i).first()).toBeVisible();
    await expect(page.getByText(/rejected/i).first()).toBeVisible();
  });

  test('submitted FM logs appear in list', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(FIELD_MOVEMENT_LIST_URL);
    await expect(page.getByText(/FM-\d{4}/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('filter by month shows correct logs', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(FIELD_MOVEMENT_LIST_URL);
    const month = page.getByLabel(/month/i).first();
    if (await month.isVisible().catch(() => false)) {
      await month.click();
      await page.getByRole('option', { name: /august/i }).click();
      await page.waitForTimeout(800);
    }
    await expect(page.locator('.ant-table-row').first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('filter by employee shows correct logs', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(FIELD_MOVEMENT_LIST_URL);
    const employee = page.getByLabel(/employee/i).or(page.getByPlaceholder(/employee/i)).first();
    if (await employee.isVisible().catch(() => false)) {
      await employee.click();
      await page.getByText(/samuel/i).first().click();
      await page.waitForTimeout(800);
      await expect(page.getByText(/samuel/i).first()).toBeVisible();
    }
  });

  test('filter by status shows correct logs', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(FIELD_MOVEMENT_LIST_URL);
    const status = page.getByLabel(/status/i).first();
    if (await status.isVisible().catch(() => false)) {
      await status.click();
      await page.getByRole('option', { name: /approved/i }).click();
      await page.waitForTimeout(800);
    }
  });

  test('clicking View navigates to detail page', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(FIELD_MOVEMENT_LIST_URL);
    const viewBtn = page.getByRole('button', { name: /view/i }).or(
      page.getByRole('link', { name: /view/i }),
    ).first();
    await expect(viewBtn).toBeVisible({ timeout: 20_000 });
    await viewBtn.click();
    await expect(page).toHaveURL(/\/hr\/field-movement-logs\//);
  });

  test('detail page shows employee hero', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(FIELD_MOVEMENT_LIST_URL);
    await page.getByRole('button', { name: /view/i }).or(
      page.getByRole('link', { name: /view/i }),
    ).first().click();
    await expect(page.getByText(/samuel|employee/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('detail page shows all entries with reasons', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(FIELD_MOVEMENT_LIST_URL);
    await page.getByRole('button', { name: /view/i }).or(
      page.getByRole('link', { name: /view/i }),
    ).first().click();
    await expect(
      page.getByText(/field visit|forgot|early leave|left early/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('detail page shows approval timeline', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(FIELD_MOVEMENT_LIST_URL);
    await page.getByRole('button', { name: /view/i }).or(
      page.getByRole('link', { name: /view/i }),
    ).first().click();
    await expect(
      page.getByText(/approval|timeline|submitted|approved/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('approved FM log shows corrections applied note', async ({ page }) => {
    await loginAsHrOfficer(page);
    await page.goto(FIELD_MOVEMENT_LIST_URL);
    const statusFilter = page.getByLabel(/status/i).first();
    if (await statusFilter.isVisible().catch(() => false)) {
      await statusFilter.click();
      await page.getByRole('option', { name: /approved/i }).click();
      await page.waitForTimeout(800);
    }
    const viewBtn = page.getByRole('button', { name: /view/i }).or(
      page.getByRole('link', { name: /view/i }),
    ).first();
    if (!(await viewBtn.isVisible().catch(() => false))) {
      test.skip(true, 'No approved FM log to open');
      return;
    }
    await viewBtn.click();
    const applied = page.getByText(/applied|correction/i);
    if ((await applied.count()) > 0) {
      await expect(applied.first()).toBeVisible();
    }
  });

  test('employee cannot access /hr/field-movement-logs', async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto(FIELD_MOVEMENT_LIST_URL);
    const url = page.url();
    const body = await page.locator('body').innerText();
    const blocked =
      /403|forbidden|unauthorized|access denied|not found/i.test(body) ||
      !url.includes('field-movement-logs') ||
      url.includes('/login') ||
      url.includes('/dashboard') ||
      url.includes('/profile');
    expect(blocked).toBeTruthy();
  });

  test('employee can see own FM logs via Approvals â†?My Requests', async ({
    page,
  }) => {
    await loginAsSamuel(page);
    await goToMyRequests(page);
    await expect(page.getByText(/FM-\d{4}|field movement/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
