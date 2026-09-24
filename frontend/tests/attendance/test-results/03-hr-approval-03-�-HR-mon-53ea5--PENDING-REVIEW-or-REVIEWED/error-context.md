# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-hr-approval.spec.ts >> 03 �?HR monthly approval >> Approve Month button visible when status is PENDING_REVIEW or REVIEWED
- Location: tests\attendance\03-hr-approval.spec.ts:23:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /approve month/i })
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByRole('button', { name: /approve month/i })

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
      - button "Human Resources" [expanded]
      - group "Human Resources":
        - button "People" [expanded]
        - list:
          - listitem:
            - link "Users":
              - /url: /users
            - button "Pin Users to favorites"
          - listitem:
            - link "Employee Contracts":
              - /url: /hr/employee-contract
            - button "Pin Employee Contracts to favorites"
        - button "Time & Leave" [expanded]
        - list:
          - listitem:
            - link "Leave Requests":
              - /url: /hr/leave-requests
            - button "Pin Leave Requests to favorites"
          - listitem:
            - link "Overtime":
              - /url: /hr/overtime
            - button "Pin Overtime to favorites"
          - listitem:
            - link "Attendance":
              - /url: /hr/attendance
            - button "Pin Attendance to favorites"
          - listitem:
            - link "Field Movement Logs":
              - /url: /hr/field-movement-logs
            - button "Pin Field Movement Logs to favorites"
          - listitem:
            - link "Work Schedules":
              - /url: /hr/work-schedules
            - button "Pin Work Schedules to favorites"
          - listitem:
            - link "Public Holidays":
              - /url: /hr/public-holidays
            - button "Pin Public Holidays to favorites"
          - listitem:
            - link "Leave Policy":
              - /url: /hr/leave-policy
            - button "Pin Leave Policy to favorites"
        - button "Travel & Expenses" [expanded]
        - list:
          - listitem:
            - link "Expense Claims":
              - /url: /hr/expense-claims
            - button "Pin Expense Claims to favorites"
          - listitem:
            - link "Flight Applications":
              - /url: /hr/flight-applications
            - button "Pin Flight Applications to favorites"
          - listitem:
            - link "Business Trips":
              - /url: /hr/business-trips
            - button "Pin Business Trips to favorites"
          - listitem:
            - link "Per Diem":
              - /url: /hr/per-diem
            - button "Pin Per Diem to favorites"
          - listitem:
            - link "Employee Per Diem Rates":
              - /url: /hr/employee-per-diem-rates
            - button "Pin Employee Per Diem Rates to favorites"
        - button "Procurement" [expanded]
        - list:
          - listitem:
            - link "Purchase Requests":
              - /url: /hr/purchase-requests
            - button "Pin Purchase Requests to favorites"
          - listitem:
            - link "Material Requisition":
              - /url: /hr/material-requisition
            - button "Pin Material Requisition to favorites"
          - listitem:
            - link "Consumables":
              - /url: /hr/consumables
            - button "Pin Consumables to favorites"
        - button "Fleet & Assets" [expanded]
        - list:
          - listitem:
            - link "Vehicle Applications":
              - /url: /hr/vehicle-applications
            - button "Pin Vehicle Applications to favorites"
          - listitem:
            - link "Vehicle Refueling":
              - /url: /hr/vehicle-refueling
            - button "Pin Vehicle Refueling to favorites"
          - listitem:
            - link "Inspection & Repair":
              - /url: /hr/inspection-repair
            - button "Pin Inspection & Repair to favorites"
          - listitem:
            - link "Company Assets":
              - /url: /hr/company-asset
            - button "Pin Company Assets to favorites"
        - button "Administration" [expanded]
        - list:
          - listitem:
            - link "Official Seal Usage":
              - /url: /hr/official-seal
            - button "Pin Official Seal Usage to favorites"
          - listitem:
            - link "Project Seal Usage":
              - /url: /hr/project-seal
            - button "Pin Project Seal Usage to favorites"
          - listitem:
            - link "Exit Permit":
              - /url: /hr/equipment-and-materials-exit-permit
            - button "Pin Exit Permit to favorites"
          - listitem:
            - link "HR Reports":
              - /url: /hr/reports
            - button "Pin HR Reports to favorites"
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
  - heading "Human Resources" [level=1]
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
  - navigation "Breadcrumb":
    - navigation:
      - list:
        - listitem:
          - link "Dashboard":
            - /url: /
        - listitem: Human Resources
        - listitem: Human Resources
  - link "Attendance":
    - /url: /hr/attendance
  - text: / Review August 2026
  - button "Back":
    - img "arrow-left"
  - heading "Review August 2026" [level=3]
  - alert:
    - img "exclamation-circle"
    - text: No monthly approval record for this period. Re-import attendance to create one.
  - img "team"
  - paragraph: Total Employees
  - paragraph: "65"
  - img "warning"
  - paragraph: Employees with Flags
  - paragraph: "0"
  - img "warning"
  - paragraph: Total Flagged Days
  - paragraph: "0"
  - img "check-circle"
  - paragraph: Resolved Flags
  - paragraph: "2"
  - table:
    - rowgroup:
      - row "Employee Scheduled Days Present Days Absent Days Flagged Days Resolved Status Actions":
        - columnheader "Employee"
        - columnheader "Scheduled Days"
        - columnheader "Present Days"
        - columnheader "Absent Days"
        - columnheader "Flagged Days"
        - columnheader "Resolved"
        - columnheader "Status"
        - columnheader "Actions"
    - rowgroup:
      - row "AA Abenezer Abadi EM-003 22.5 20 2.5 0 0/0 No Flags View Daily Logs":
        - cell "AA Abenezer Abadi EM-003":
          - text: AA
          - paragraph: Abenezer Abadi
          - text: EM-003
        - cell "22.5"
        - cell "20"
        - cell "2.5"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "EA Eskender Abebaw EM-030 22.5 22.5 0 0 0/0 No Flags View Daily Logs":
        - cell "EA Eskender Abebaw EM-030":
          - text: EA
          - paragraph: Eskender Abebaw
          - text: EM-030
        - cell "22.5"
        - cell "22.5"
        - cell "0"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "HA Helen Abebaw EM-045 22.5 21 1.5 0 0/0 No Flags View Daily Logs":
        - cell "HA Helen Abebaw EM-045":
          - text: HA
          - paragraph: Helen Abebaw
          - text: EM-045
        - cell "22.5"
        - cell "21"
        - cell "1.5"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "SA Sony Aboye EM-103 22.5 1 21.5 0 0/0 No Flags View Daily Logs":
        - cell "SA Sony Aboye EM-103":
          - text: SA
          - paragraph: Sony Aboye
          - text: EM-103
        - cell "22.5"
        - cell "1"
        - cell "21.5"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "MA Mestawet Adam EM-068 22.5 21.5 1 0 0/0 No Flags View Daily Logs":
        - cell "MA Mestawet Adam EM-068":
          - text: MA
          - paragraph: Mestawet Adam
          - text: EM-068
        - cell "22.5"
        - cell "21.5"
        - cell "1"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "SA Samrawit Adane EM-091 22.5 20.5 2 0 0/0 No Flags View Daily Logs":
        - cell "SA Samrawit Adane EM-091":
          - text: SA
          - paragraph: Samrawit Adane
          - text: EM-091
        - cell "22.5"
        - cell "20.5"
        - cell "2"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "MA Mihret Alemayehu EM-069 22.5 1 21.5 0 0/0 No Flags View Daily Logs":
        - cell "MA Mihret Alemayehu EM-069":
          - text: MA
          - paragraph: Mihret Alemayehu
          - text: EM-069
        - cell "22.5"
        - cell "1"
        - cell "21.5"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "NA Nahom Alemayehu EM-078 22.5 22.5 0 0 0/0 No Flags View Daily Logs":
        - cell "NA Nahom Alemayehu EM-078":
          - text: NA
          - paragraph: Nahom Alemayehu
          - text: EM-078
        - cell "22.5"
        - cell "22.5"
        - cell "0"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "NA Netsihit Alemayehu EM-086 22.5 20.5 2 0 0/0 No Flags View Daily Logs":
        - cell "NA Netsihit Alemayehu EM-086":
          - text: NA
          - paragraph: Netsihit Alemayehu
          - text: EM-086
        - cell "22.5"
        - cell "20.5"
        - cell "2"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "EA Eden Alemu EM-027 22.5 20 2.5 0 0/0 No Flags View Daily Logs":
        - cell "EA Eden Alemu EM-027":
          - text: EA
          - paragraph: Eden Alemu
          - text: EM-027
        - cell "22.5"
        - cell "20"
        - cell "2.5"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "BA Biruk Alemu EM-016 22.5 15 7.5 0 0/0 No Flags View Daily Logs":
        - cell "BA Biruk Alemu EM-016":
          - text: BA
          - paragraph: Biruk Alemu
          - text: EM-016
        - cell "22.5"
        - cell "15"
        - cell "7.5"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "NA Natnael Argaw EM-081 22.5 21.5 1 0 0/0 No Flags View Daily Logs":
        - cell "NA Natnael Argaw EM-081":
          - text: NA
          - paragraph: Natnael Argaw
          - text: EM-081
        - cell "22.5"
        - cell "21.5"
        - cell "1"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "MA Mekides Asfaw EM-066 22.5 2.5 20 0 0/0 No Flags View Daily Logs":
        - cell "MA Mekides Asfaw EM-066":
          - text: MA
          - paragraph: Mekides Asfaw
          - text: EM-066
        - cell "22.5"
        - cell "2.5"
        - cell "20"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "YA Yisak Assefa EM-129 22.5 22.5 0 0 0/0 No Flags View Daily Logs":
        - cell "YA Yisak Assefa EM-129":
          - text: YA
          - paragraph: Yisak Assefa
          - text: EM-129
        - cell "22.5"
        - cell "22.5"
        - cell "0"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "SB Shimelis Bacha EM-098 22.5 0 22.5 0 0/0 No Flags View Daily Logs":
        - cell "SB Shimelis Bacha EM-098":
          - text: SB
          - paragraph: Shimelis Bacha
          - text: EM-098
        - cell "22.5"
        - cell "0"
        - cell "22.5"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "MB Medhanit Berhanu EM-064 22.5 0 22.5 0 0/0 No Flags View Daily Logs":
        - cell "MB Medhanit Berhanu EM-064":
          - text: MB
          - paragraph: Medhanit Berhanu
          - text: EM-064
        - cell "22.5"
        - cell "0"
        - cell "22.5"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "MB Mizen Beyene EM-073 22.5 0 22.5 0 0/0 No Flags View Daily Logs":
        - cell "MB Mizen Beyene EM-073":
          - text: MB
          - paragraph: Mizen Beyene
          - text: EM-073
        - cell "22.5"
        - cell "0"
        - cell "22.5"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "SB Selamawit Beyene EM-095 22.5 17.5 5 0 0/0 No Flags View Daily Logs":
        - cell "SB Selamawit Beyene EM-095":
          - text: SB
          - paragraph: Selamawit Beyene
          - text: EM-095
        - cell "22.5"
        - cell "17.5"
        - cell "5"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "TB Tewele Brhane EM-112 22.5 22 0.5 0 0/0 No Flags View Daily Logs":
        - cell "TB Tewele Brhane EM-112":
          - text: TB
          - paragraph: Tewele Brhane
          - text: EM-112
        - cell "22.5"
        - cell "22"
        - cell "0.5"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
      - row "DD Dame Daba EM-022 22.5 0 22.5 0 0/0 No Flags View Daily Logs":
        - cell "DD Dame Daba EM-022":
          - text: DD
          - paragraph: Dame Daba
          - text: EM-022
        - cell "22.5"
        - cell "0"
        - cell "22.5"
        - cell "0"
        - cell "0/0"
        - cell "No Flags"
        - cell "View Daily Logs":
          - button "View Daily Logs"
  - list:
    - listitem "Previous Page":
      - button "left" [disabled]:
        - img "left"
    - listitem "1"
    - listitem "2"
    - listitem "3"
    - listitem "4"
    - listitem "Next Page":
      - button "right":
        - img "right"
    - listitem:
      - text: 20 / page
      - combobox "Page Size"
      - img "down"
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
> 28  |     ).toBeVisible({ timeout: 30_000 });
      |       ^ Error: expect(locator).toBeVisible() failed
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
  72  |     ).toBeVisible({ timeout: 20_000 });
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
```