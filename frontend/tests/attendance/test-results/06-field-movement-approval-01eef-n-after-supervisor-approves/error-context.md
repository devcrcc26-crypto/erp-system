# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 06-field-movement-approval.spec.ts >> 06 �?Field movement approval chain >> HR Officer sees FM log in Pending My Action after supervisor approves
- Location: tests\attendance\06-field-movement-approval.spec.ts:75:7

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
  - link "team Employees 145":
    - /url: /users
    - img "team"
    - paragraph: Employees
    - paragraph: "145"
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
  - link "warning No leave policy 142 Needs assignment":
    - /url: /users
    - img "warning"
    - paragraph: No leave policy
    - paragraph: "142"
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
  29  |     await expect(page.getByText(/FM-\d{4}|field movement/i).first()).toBeVisible({
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
> 80  |     await expect(page.getByText(/FM-\d{4}|field movement/i).first()).toBeVisible({
      |                                                                      ^ Error: expect(locator).toBeVisible() failed
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
  130 |     await logout(page);
  131 |     await loginAsSupervisor(page);
  132 |     await goToPendingMyAction(page);
  133 |     await openFirstFieldMovement(page);
  134 |     const returnBtn = page.getByRole('button', { name: /return/i });
  135 |     await expect(returnBtn).toBeVisible({ timeout: 20_000 });
  136 |     await returnBtn.click();
  137 |     const comment = page.getByLabel(/comment|reason|note/i).first();
  138 |     if (await comment.isVisible().catch(() => false)) {
  139 |       await comment.fill('Please clarify the departure time');
  140 |     }
  141 |     const confirm = page.getByRole('button', { name: /return|confirm|ok/i }).last();
  142 |     await confirm.click();
  143 | 
  144 |     await logout(page);
  145 |     await loginAsSamuel(page);
  146 |     await goToMyRequests(page);
  147 |     await expect(page.getByText(/returned/i).first()).toBeVisible({
  148 |       timeout: 30_000,
  149 |     });
  150 |   });
  151 | 
  152 |   test('returned FM log can be resubmitted after editing', async ({ page }) => {
  153 |     await loginAsSamuel(page);
  154 |     await goToMyRequests(page);
  155 |     const returned = page
  156 |       .locator('.ant-table-row, a, .ant-list-item')
  157 |       .filter({ hasText: /returned/i })
  158 |       .first();
  159 |     if (!(await returned.isVisible().catch(() => false))) {
  160 |       test.skip(true, 'No returned FM log available');
  161 |       return;
  162 |     }
  163 |     await returned.click();
  164 |     const editOrResubmit = page.getByRole('button', {
  165 |       name: /edit|resubmit|submit/i,
  166 |     });
  167 |     if (await editOrResubmit.first().isVisible().catch(() => false)) {
  168 |       await editOrResubmit.first().click();
  169 |       const submit = page.getByRole('button', { name: /submit|resubmit/i }).last();
  170 |       if (await submit.isVisible().catch(() => false)) {
  171 |         await submit.click();
  172 |       }
  173 |     }
  174 |     await expect(
  175 |       page.getByText(/submitted|pending/i).first(),
  176 |     ).toBeVisible({ timeout: 30_000 });
  177 |   });
  178 | 
  179 |   test('HR Officer can reject FM log', async ({ page }) => {
  180 |     await loginAsHrOfficer(page);
```