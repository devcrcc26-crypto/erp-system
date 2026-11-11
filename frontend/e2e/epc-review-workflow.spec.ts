import { test, expect } from '@playwright/test';
import { E2E_USERS, EPC_DEMO } from './fixtures/epc-demo';
import { isBackendReachable, loginAs } from './helpers/auth';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3008/api';

test.describe('EPC review workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test.beforeAll(async () => {
    const reachable = await isBackendReachable(API_BASE_URL);
    test.skip(
      !reachable,
      'Backend API is not reachable - start backend and run db:seed before E2E tests.',
    );
  });

  test('reviewer opens inbox and enters review mode', async ({ page }) => {
    await loginAs(
      page,
      E2E_USERS.reviewer.email,
      E2E_USERS.reviewer.password,
    );

    await page.goto('/review-inbox');
    await expect(page.getByRole('heading', { name: 'Review Inbox' })).toBeVisible();
    await expect(page.getByTestId('review-inbox-table')).toBeVisible({
      timeout: 15_000,
    });

    const packageLink = page.getByRole('link', {
      name: EPC_DEMO.designPackageName,
    });
    if (await packageLink.isVisible()) {
      await packageLink.click();
    } else {
      await page.goto(
        `/design-packages/${EPC_DEMO.designPackageId}/review` +
          `?projectId=${EPC_DEMO.projectId}&disciplineId=${EPC_DEMO.taskDisciplineId}`,
      );
    }

    await expect(page).toHaveURL(
      new RegExp(`/design-packages/${EPC_DEMO.designPackageId}/review`),
    );
    await expect(page.getByTestId('review-mode-panel')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Approve all' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  });

  test('designer sees assigned comment in My Comments', async ({ page }) => {
    await loginAs(
      page,
      E2E_USERS.designer.email,
      E2E_USERS.designer.password,
    );

    await page.goto('/my-comments');
    await expect(page.getByRole('heading', { name: 'My Comments' })).toBeVisible();
    await expect(
      page.getByText(EPC_DEMO.reviewCommentSnippet, { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('discipline lead can open review mode directly', async ({ page }) => {
    await loginAs(page, E2E_USERS.lead.email, E2E_USERS.lead.password);

    const reviewUrl =
      `/design-packages/${EPC_DEMO.designPackageLeadId}/review` +
      `?projectId=${EPC_DEMO.projectId}&disciplineId=${EPC_DEMO.taskDisciplineId}`;

    await page.goto(reviewUrl);
    await expect(page.getByTestId('review-mode-panel')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Approve all' })).toBeVisible();
  });
});
