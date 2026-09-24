# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 06-field-movement-approval.spec.ts >> 06 �?Field movement approval chain >> Supervisor sees FM log in Pending My Action
- Location: tests\attendance\06-field-movement-approval.spec.ts:26:7

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/FM-\d{4}|field movement/i).first()
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByText(/FM-\d{4}|field movement/i).first()
  - Test timeout of 45000ms exceeded.

```

```yaml
- link "Skip to main content":
  - /url: "#main-content"
- navigation "Main navigation":
  - link "CCECC workspace":
    - /url: /
    - img "CCECC"
    - text: CCECC
  - text: Find a module
  - searchbox "Find a module"
  - paragraph
  - list:
    - listitem:
      - link "Dashboard":
        - /url: /
    - listitem:
      - link "New Request":
        - /url: /approvals/new
  - list:
    - listitem:
      - link "Approvals 17 pending approvals":
        - /url: /approvals
    - listitem:
      - link "My Profile":
        - /url: /profile
  - button "Collapse sidebar"
- main:
  - heading "Dashboard" [level=1]
  - button "Switch to 中文":
    - img "global"
    - text: EN
  - button "Open notifications":
    - img "bell"
    - superscript: 2 6
  - button "Open profile":
    - text: X
    - paragraph: Xiaoming Li (李晓铭)
    - paragraph: Project Administrator
  - paragraph: My dashboard · Thursday, 24 September 2026
  - heading "Good morning, Xiaoming" [level=1]
  - link "calendar Annual leave remaining 20 20 of 20 days":
    - /url: /hr/leave-requests
    - img "calendar"
    - paragraph: Annual leave remaining
    - paragraph: "20"
    - paragraph: 20 of 20 days
  - link "clock-circle Pending leave 0 Submitted or in review":
    - /url: /hr/leave-requests
    - img "clock-circle"
    - paragraph: Pending leave
    - paragraph: "0"
    - paragraph: Submitted or in review
  - img "field-time"
  - paragraph: Overtime this month
  - paragraph: "0"
  - paragraph: 0h
  - link "calendar Upcoming holidays 0 Next 60 days":
    - /url: /profile
    - img "calendar"
    - paragraph: Upcoming holidays
    - paragraph: "0"
    - paragraph: Next 60 days
  - img "calendar"
  - heading "My leave requests" [level=3]
  - link "View all →":
    - /url: /hr/leave-requests
  - paragraph: You have no leave requests yet.
  - img "calendar"
  - heading "Upcoming holidays" [level=3]
  - paragraph: Next 60 days
  - link "View all →":
    - /url: /profile
  - paragraph: No upcoming holidays in the next 60 days
- alert
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import {
  3   |   loginAsSupervisor,
  4   |   loginAsHrOfficer,
  5   |   loginAsSamuel,
  6   |   logout,
  7   | } from './helpers/auth';
  8   | import {
  9   |   goToPendingMyAction,
  10  |   goToMyRequests,
  11  |   goToProfileAttendance,
  12  |   TEST_MONTH,
  13  |   TEST_YEAR,
  14  | } from './helpers/attendance.helpers';
  15  | 
  16  | async function openFirstFieldMovement(page: import('@playwright/test').Page): Promise<void> {
  17  |   const row = page
  18  |     .locator('.ant-table-row, [data-row-key], a, .ant-list-item')
  19  |     .filter({ hasText: /FM-\d{4}|field movement/i })
  20  |     .first();
  21  |   await expect(row).toBeVisible({ timeout: 30_000 });
  22  |   await row.click();
  23  | }
  24  | 
  25  | test.describe('06 �?Field movement approval chain', () => {
  26  |   test('Supervisor sees FM log in Pending My Action', async ({ page }) => {
  27  |     await loginAsSupervisor(page);
  28  |     await goToPendingMyAction(page);
> 29  |     await expect(page.getByText(/FM-\d{4}|field movement/i).first()).toBeVisible({
      |                                                                      ^ Error: expect(locator).toBeVisible() failed
  30  |       timeout: 30_000,
  31  |     });
  32  |   });
  33  | 
  34  |   test('approval body shows employee name, period, and entries', async ({
  35  |     page,
  36  |   }) => {
  37  |     await loginAsSupervisor(page);
  38  |     await goToPendingMyAction(page);
  39  |     await openFirstFieldMovement(page);
  40  |     await expect(page.getByText(/samuel/i).first()).toBeVisible({
  41  |       timeout: 20_000,
  42  |     });
  43  |     await expect(page.getByText(/august 2026|8\/2026|2026/i).first()).toBeVisible();
  44  |   });
  45  | 
  46  |   test('approval body shows destination for field visit entries', async ({
  47  |     page,
  48  |   }) => {
  49  |     await loginAsSupervisor(page);
  50  |     await goToPendingMyAction(page);
  51  |     await openFirstFieldMovement(page);
  52  |     const body = await page.locator('body').innerText();
  53  |     // Destination only appears for FIELD_VISIT entries; soft assert
  54  |     if (/destination|site|field visit/i.test(body)) {
  55  |       expect(body.toLowerCase()).toMatch(/destination|field visit|site/);
  56  |     }
  57  |   });
  58  | 
  59  |   test('supervisor can approve FM log', async ({ page }) => {
  60  |     await loginAsSupervisor(page);
  61  |     await goToPendingMyAction(page);
  62  |     await openFirstFieldMovement(page);
  63  |     const approve = page.getByRole('button', { name: /^approve$/i });
  64  |     await expect(approve).toBeVisible({ timeout: 20_000 });
  65  |     await approve.click();
  66  |     const confirm = page.getByRole('dialog').getByRole('button', { name: /approve|confirm|ok/i });
  67  |     if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) {
  68  |       await confirm.click();
  69  |     }
  70  |     await expect(
  71  |       page.getByText(/approved|forwarded|success|pending/i).first(),
  72  |     ).toBeVisible({ timeout: 20_000 });
  73  |   });
  74  | 
  75  |   test('HR Officer sees FM log in Pending My Action after supervisor approves', async ({
  76  |     page,
  77  |   }) => {
  78  |     await loginAsHrOfficer(page);
  79  |     await goToPendingMyAction(page);
  80  |     await expect(page.getByText(/FM-\d{4}|field movement/i).first()).toBeVisible({
  81  |       timeout: 30_000,
  82  |     });
  83  |   });
  84  | 
  85  |   test('HR Officer approves FM log', async ({ page }) => {
  86  |     await loginAsHrOfficer(page);
  87  |     await goToPendingMyAction(page);
  88  |     await openFirstFieldMovement(page);
  89  |     const approve = page.getByRole('button', { name: /^approve$/i });
  90  |     await expect(approve).toBeVisible({ timeout: 20_000 });
  91  |     await approve.click();
  92  |     const confirm = page.getByRole('dialog').getByRole('button', { name: /approve|confirm|ok/i });
  93  |     if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) {
  94  |       await confirm.click();
  95  |     }
  96  |     await expect(page.getByText(/approved/i).first()).toBeVisible({
  97  |       timeout: 20_000,
  98  |     });
  99  |   });
  100 | 
  101 |   test('supervisor can return FM log with a comment', async ({ page }) => {
  102 |     // Create a new FM if possible, then return it
  103 |     await loginAsSamuel(page);
  104 |     await goToProfileAttendance(page, TEST_MONTH, TEST_YEAR);
  105 |     const submitBtn = page.getByRole('button', { name: /submit explanation/i });
  106 |     if (!(await submitBtn.isVisible().catch(() => false))) {
  107 |       test.skip(true, 'No remaining flagged days to submit a returnable FM log');
  108 |       return;
  109 |     }
  110 |     await submitBtn.click();
  111 |     const modal = page.getByRole('dialog');
  112 |     const checkbox = modal.locator('.ant-checkbox-input').first();
  113 |     if (!(await checkbox.isVisible().catch(() => false))) {
  114 |       test.skip(true, 'No selectable flagged days');
  115 |       return;
  116 |     }
  117 |     await checkbox.check({ force: true });
  118 |     await modal.getByRole('button', { name: /next/i }).click();
  119 |     await modal.getByRole('combobox').first().click();
  120 |     await page.getByText(/forgot to clock out|left early|field/i).first().click();
  121 |     if (await modal.getByLabel(/destination/i).isVisible().catch(() => false)) {
  122 |       await modal.getByLabel(/destination/i).fill('Site A');
  123 |     }
  124 |     await modal.getByRole('button', { name: /next|review/i }).click();
  125 |     await modal.getByRole('button', { name: /submit/i }).click();
  126 |     await expect(page.getByText(/FM-\d{4}/i).first()).toBeVisible({
  127 |       timeout: 30_000,
  128 |     });
  129 | 
```