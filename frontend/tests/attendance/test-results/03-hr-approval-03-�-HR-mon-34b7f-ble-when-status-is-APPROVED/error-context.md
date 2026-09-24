# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-hr-approval.spec.ts >> 03 �?HR monthly approval >> Unlock Month button visible when status is APPROVED
- Location: tests\attendance\03-hr-approval.spec.ts:66:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /unlock month/i })
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('button', { name: /unlock month/i })

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
    - listitem:
      - button "Human Resources"
    - listitem:
      - button "Organization"
  - list:
    - listitem:
      - link "Approvals 36 pending approvals":
        - /url: /approvals
    - listitem:
      - link "My Profile":
        - /url: /profile
    - listitem:
      - link "Settings":
        - /url: /settings
  - button "Collapse sidebar"
- main:
  - heading "Dashboard" [level=1]
  - button "Switch to 中文":
    - img "global"
    - text: EN
  - button "Open notifications":
    - img "bell"
    - superscript: 3 9
  - button "Open profile":
    - text: J
    - paragraph: Jinxia Dong (董锦霞)
    - paragraph: HR Officer
  - paragraph: HR Dashboard · Thursday, 24 September 2026
  - heading "Good morning, Jinxia" [level=1]
  - link "team Employees 137":
    - /url: /users
    - img "team"
    - paragraph: Employees
    - paragraph: "137"
  - link "calendar On leave 0 This week":
    - /url: /hr/leave-requests
    - img "calendar"
    - paragraph: On leave
    - paragraph: "0"
    - paragraph: This week
  - link "clock-circle Pending leave 4":
    - /url: /hr/leave-requests
    - img "clock-circle"
    - paragraph: Pending leave
    - paragraph: "4"
  - link "field-time Pending overtime 3":
    - /url: /hr/overtime
    - img "field-time"
    - paragraph: Pending overtime
    - paragraph: "3"
  - link "send Flight tickets 9 Booking required":
    - /url: /hr/flight-applications
    - img "send"
    - paragraph: Flight tickets
    - paragraph: "9"
    - paragraph: Booking required
  - link "file Contracts expiring 0 Within 90 days":
    - /url: /hr/employee-contract
    - img "file"
    - paragraph: Contracts expiring
    - paragraph: "0"
    - paragraph: Within 90 days
  - link "warning No leave policy 134 Needs assignment":
    - /url: /users
    - img "warning"
    - paragraph: No leave policy
    - paragraph: "134"
    - paragraph: Needs assignment
  - img "calendar"
  - heading "Leave request trend" [level=3]
  - paragraph: Approved vs rejected over 6 months
  - list:
    - listitem:
      - img "Approved legend icon"
      - text: Approved
    - listitem:
      - img "Rejected legend icon"
      - text: Rejected
    - listitem:
      - img "Total legend icon"
      - text: Total
  - application: Apr 2026 May 2026 Jun 2026 Jul 2026 Aug 2026 Sep 2026 0 3 6 9 12
  - img "calendar"
  - heading "Leave mix" [level=3]
  - paragraph: Last 6 months by type
  - application
  - paragraph: "8"
  - paragraph: Requests
  - text: Annual 75% Emergency 13% Sick 13%
  - img "clock-circle"
  - heading "Pending approvals" [level=3]
  - paragraph: 34 open across 11 modules
  - application: Purchase Re… Vehicle App… Third-Count… Material Re… Office Vehi… Low-Value C… Expense Cla… Flight Appl… Overtime Ap… Per Diem Re… Leave Reque… 0 1 2 3 4 4 4 4 4 3 3 3 3 2 2 2
  - img "team"
  - heading "Headcount" [level=3]
  - paragraph: Active employees by department
  - application: 0 3 6 9 12 Others ArchitecturalDes… MunicipalTranspo… AdministrativeDe…
  - img "calendar"
  - heading "Recent leave" [level=3]
  - link "View all →":
    - /url: /hr/leave-requests
  - text: ET
  - paragraph: Eyuel Tilahun
  - paragraph: Annual · 4d · 05/09/2026
  - text: Submitted HA
  - paragraph: Hassan Al-Rashid
  - paragraph: Annual · 3d · 01/10/2026
  - text: Submitted HA
  - paragraph: Hassan Al-Rashid
  - paragraph: Unpaid · 5d · 25/08/2026
  - text: Rejected KN
  - paragraph: Khalid Nasser
  - paragraph: Annual · 5d · 10/09/2026
  - text: Submitted KN
  - paragraph: Khalid Nasser
  - paragraph: Sick · 3d · 05/08/2026
  - text: Returned NS
  - paragraph: Nadia Saleh
  - paragraph: Emergency · 1d · 28/07/2026
  - text: Approved NS
  - paragraph: Nadia Saleh
  - paragraph: Annual · 3d · 18/08/2026
  - text: Approved WC
  - paragraph: Wei Chen
  - paragraph: Annual · 5d · 01/09/2026
  - text: In Review
  - img "send"
  - heading "Upcoming travel" [level=3]
  - paragraph: Next 30 days
  - paragraph: No upcoming travel
- alert
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { loginAs } from './helpers/auth';
  3   | import {
  4   |   REVIEW_URL,
  5   |   ATTENDANCE_LIST_URL,
  6   |   openDailyLogsForEmployee,
  7   |   selectAttendancePeriod,
  8   | } from './helpers/attendance.helpers';
  9   | 
  10  | test.describe('03 �?HR monthly approval', () => {
  11  |   test.beforeEach(async ({ page }) => {
  12  |     await loginAs(
  13  |       page,
  14  |       'jinxia.dong@company.local',
  15  |       'Admin@12345',
  16  |       REVIEW_URL,
  17  |     );
  18  |     if (!page.url().includes('/hr/attendance/review/')) {
  19  |       await page.goto(REVIEW_URL);
  20  |     }
  21  |   });
  22  | 
  23  |   test('Approve Month button visible when status is PENDING_REVIEW or REVIEWED', async ({
  24  |     page,
  25  |   }) => {
  26  |     await expect(
  27  |       page.getByRole('button', { name: /approve month/i }),
  28  |     ).toBeVisible({ timeout: 30_000 });
  29  |   });
  30  | 
  31  |   test('Approve Month shows confirmation modal', async ({ page }) => {
  32  |     await page.goto(REVIEW_URL);
  33  |     await page.getByRole('button', { name: /approve month/i }).click();
  34  |     const modal = page.getByRole('dialog');
  35  |     await expect(modal).toBeVisible();
  36  |     await expect(modal.getByText(/lock the attendance/i)).toBeVisible();
  37  |     await expect(modal.getByText(/notify/i)).toBeVisible();
  38  |   });
  39  | 
  40  |   test('confirming approval changes status to APPROVED', async ({ page }) => {
  41  |     await page.goto(REVIEW_URL);
  42  |     const approveBtn = page.getByRole('button', { name: /approve month/i });
  43  |     if (await approveBtn.isVisible().catch(() => false)) {
  44  |       await approveBtn.click();
  45  |       await page
  46  |         .getByRole('dialog')
  47  |         .getByRole('button', { name: /^approve$/i })
  48  |         .click();
  49  |     }
  50  |     await expect(
  51  |       page.getByText(/approved and locked/i).first(),
  52  |     ).toBeVisible({ timeout: 30_000 });
  53  |   });
  54  | 
  55  |   test('corrections not possible after approval �?error shown', async ({
  56  |     page,
  57  |   }) => {
  58  |     await page.goto(REVIEW_URL);
  59  |     await openDailyLogsForEmployee(page, /samuel/i);
  60  |     const correctBtn = page
  61  |       .locator('.ant-drawer')
  62  |       .getByRole('button', { name: /^correct$/i });
  63  |     await expect(correctBtn).toHaveCount(0);
  64  |   });
  65  | 
  66  |   test('Unlock Month button visible when status is APPROVED', async ({
  67  |     page,
  68  |   }) => {
  69  |     await page.goto(REVIEW_URL);
  70  |     await expect(
  71  |       page.getByRole('button', { name: /unlock month/i }),
> 72  |     ).toBeVisible({ timeout: 20_000 });
      |       ^ Error: expect(locator).toBeVisible() failed
  73  |   });
  74  | 
  75  |   test('Unlock Month requires a reason �?empty reason shows error', async ({
  76  |     page,
  77  |   }) => {
  78  |     await page.goto(REVIEW_URL);
  79  |     await page.getByRole('button', { name: /unlock month/i }).click();
  80  |     await page
  81  |       .getByRole('dialog')
  82  |       .getByRole('button', { name: /^unlock$/i })
  83  |       .click();
  84  |     await expect(
  85  |       page.getByText(/please enter a reason|reason/i).first(),
  86  |     ).toBeVisible();
  87  |   });
  88  | 
  89  |   test('unlocking changes status to UNLOCKED', async ({ page }) => {
  90  |     await page.goto(REVIEW_URL);
  91  |     await page.getByRole('button', { name: /unlock month/i }).click();
  92  |     await page
  93  |       .getByLabel(/unlock reason/i)
  94  |       .fill('Correcting clock-in error for Samuel');
  95  |     await page
  96  |       .getByRole('dialog')
  97  |       .getByRole('button', { name: /^unlock$/i })
  98  |       .click();
  99  |     await expect(page.getByText(/unlocked/i).first()).toBeVisible({
  100 |       timeout: 20_000,
  101 |     });
  102 |   });
  103 | 
  104 |   test('corrections possible again after unlock', async ({ page }) => {
  105 |     await page.goto(REVIEW_URL);
  106 |     await openDailyLogsForEmployee(page, /samuel/i);
  107 |     await expect(
  108 |       page
  109 |         .locator('.ant-drawer')
  110 |         .getByRole('button', { name: /^correct$/i })
  111 |         .first(),
  112 |     ).toBeVisible({ timeout: 15_000 });
  113 |   });
  114 | 
  115 |   test('re-approving after unlock works correctly', async ({ page }) => {
  116 |     await page.goto(REVIEW_URL);
  117 |     await page.getByRole('button', { name: /approve month/i }).click();
  118 |     await page
  119 |       .getByRole('dialog')
  120 |       .getByRole('button', { name: /^approve$/i })
  121 |       .click();
  122 |     await expect(
  123 |       page.getByText(/approved and locked/i).first(),
  124 |     ).toBeVisible({ timeout: 30_000 });
  125 |   });
  126 | 
  127 |   test('Review button on attendance list page shows correct status badge', async ({
  128 |     page,
  129 |   }) => {
  130 |     await page.goto(ATTENDANCE_LIST_URL);
  131 |     await selectAttendancePeriod(page);
  132 |     await expect(
  133 |       page.getByText(/^approved$/i).first(),
  134 |     ).toBeVisible({ timeout: 20_000 });
  135 |   });
  136 | });
  137 | 
```