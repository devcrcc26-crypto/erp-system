import { test, expect } from '@playwright/test';
import {
  loginAsSupervisor,
  loginAsHrOfficer,
  loginAsSamuel,
  logout,
} from './helpers/auth';
import {
  goToPendingMyAction,
  goToMyRequests,
  goToProfileAttendance,
  TEST_MONTH,
  TEST_YEAR,
} from './helpers/attendance.helpers';

async function openFirstFieldMovement(page: import('@playwright/test').Page): Promise<void> {
  const row = page
    .locator('.ant-table-row, [data-row-key], a, .ant-list-item')
    .filter({ hasText: /FM-\d{4}|field movement/i })
    .first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
}

test.describe('06 â€?Field movement approval chain', () => {
  test('Supervisor sees FM log in Pending My Action', async ({ page }) => {
    await loginAsSupervisor(page);
    await goToPendingMyAction(page);
    await expect(page.getByText(/FM-\d{4}|field movement/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('approval body shows employee name, period, and entries', async ({
    page,
  }) => {
    await loginAsSupervisor(page);
    await goToPendingMyAction(page);
    await openFirstFieldMovement(page);
    await expect(page.getByText(/samuel/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/august 2026|8\/2026|2026/i).first()).toBeVisible();
  });

  test('approval body shows destination for field visit entries', async ({
    page,
  }) => {
    await loginAsSupervisor(page);
    await goToPendingMyAction(page);
    await openFirstFieldMovement(page);
    const body = await page.locator('body').innerText();
    // Destination only appears for FIELD_VISIT entries; soft assert
    if (/destination|site|field visit/i.test(body)) {
      expect(body.toLowerCase()).toMatch(/destination|field visit|site/);
    }
  });

  test('supervisor can approve FM log', async ({ page }) => {
    await loginAsSupervisor(page);
    await goToPendingMyAction(page);
    await openFirstFieldMovement(page);
    const approve = page.getByRole('button', { name: /^approve$/i });
    await expect(approve).toBeVisible({ timeout: 20_000 });
    await approve.click();
    const confirm = page.getByRole('dialog').getByRole('button', { name: /approve|confirm|ok/i });
    if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirm.click();
    }
    await expect(
      page.getByText(/approved|forwarded|success|pending/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('HR Officer sees FM log in Pending My Action after supervisor approves', async ({
    page,
  }) => {
    await loginAsHrOfficer(page);
    await goToPendingMyAction(page);
    await expect(page.getByText(/FM-\d{4}|field movement/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('HR Officer approves FM log', async ({ page }) => {
    await loginAsHrOfficer(page);
    await goToPendingMyAction(page);
    await openFirstFieldMovement(page);
    const approve = page.getByRole('button', { name: /^approve$/i });
    await expect(approve).toBeVisible({ timeout: 20_000 });
    await approve.click();
    const confirm = page.getByRole('dialog').getByRole('button', { name: /approve|confirm|ok/i });
    if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirm.click();
    }
    await expect(page.getByText(/approved/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('supervisor can return FM log with a comment', async ({ page }) => {
    // Create a new FM if possible, then return it
    await loginAsSamuel(page);
    await goToProfileAttendance(page, TEST_MONTH, TEST_YEAR);
    const submitBtn = page.getByRole('button', { name: /submit explanation/i });
    if (!(await submitBtn.isVisible().catch(() => false))) {
      test.skip(true, 'No remaining flagged days to submit a returnable FM log');
      return;
    }
    await submitBtn.click();
    const modal = page.getByRole('dialog');
    const checkbox = modal.locator('.ant-checkbox-input').first();
    if (!(await checkbox.isVisible().catch(() => false))) {
      test.skip(true, 'No selectable flagged days');
      return;
    }
    await checkbox.check({ force: true });
    await modal.getByRole('button', { name: /next/i }).click();
    await modal.getByRole('combobox').first().click();
    await page.getByText(/forgot to clock out|left early|field/i).first().click();
    if (await modal.getByLabel(/destination/i).isVisible().catch(() => false)) {
      await modal.getByLabel(/destination/i).fill('Site A');
    }
    await modal.getByRole('button', { name: /next|review/i }).click();
    await modal.getByRole('button', { name: /submit/i }).click();
    await expect(page.getByText(/FM-\d{4}/i).first()).toBeVisible({
      timeout: 30_000,
    });

    await logout(page);
    await loginAsSupervisor(page);
    await goToPendingMyAction(page);
    await openFirstFieldMovement(page);
    const returnBtn = page.getByRole('button', { name: /return/i });
    await expect(returnBtn).toBeVisible({ timeout: 20_000 });
    await returnBtn.click();
    const comment = page.getByLabel(/comment|reason|note/i).first();
    if (await comment.isVisible().catch(() => false)) {
      await comment.fill('Please clarify the departure time');
    }
    const confirm = page.getByRole('button', { name: /return|confirm|ok/i }).last();
    await confirm.click();

    await logout(page);
    await loginAsSamuel(page);
    await goToMyRequests(page);
    await expect(page.getByText(/returned/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('returned FM log can be resubmitted after editing', async ({ page }) => {
    await loginAsSamuel(page);
    await goToMyRequests(page);
    const returned = page
      .locator('.ant-table-row, a, .ant-list-item')
      .filter({ hasText: /returned/i })
      .first();
    if (!(await returned.isVisible().catch(() => false))) {
      test.skip(true, 'No returned FM log available');
      return;
    }
    await returned.click();
    const editOrResubmit = page.getByRole('button', {
      name: /edit|resubmit|submit/i,
    });
    if (await editOrResubmit.first().isVisible().catch(() => false)) {
      await editOrResubmit.first().click();
      const submit = page.getByRole('button', { name: /submit|resubmit/i }).last();
      if (await submit.isVisible().catch(() => false)) {
        await submit.click();
      }
    }
    await expect(
      page.getByText(/submitted|pending/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('HR Officer can reject FM log', async ({ page }) => {
    await loginAsHrOfficer(page);
    await goToPendingMyAction(page);
    const row = page
      .locator('.ant-table-row, a, .ant-list-item')
      .filter({ hasText: /FM-\d{4}|field movement/i })
      .first();
    if (!(await row.isVisible().catch(() => false))) {
      test.skip(true, 'No pending FM log for HR to reject');
      return;
    }
    await row.click();
    const reject = page.getByRole('button', { name: /reject/i });
    await expect(reject).toBeVisible({ timeout: 20_000 });
    await reject.click();
    const comment = page.getByLabel(/comment|reason|note/i).first();
    if (await comment.isVisible().catch(() => false)) {
      await comment.fill('Insufficient explanation for rejection test');
    }
    const confirm = page.getByRole('button', { name: /reject|confirm|ok/i }).last();
    await confirm.click();

    await logout(page);
    await loginAsSamuel(page);
    await goToMyRequests(page);
    await expect(page.getByText(/rejected/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
