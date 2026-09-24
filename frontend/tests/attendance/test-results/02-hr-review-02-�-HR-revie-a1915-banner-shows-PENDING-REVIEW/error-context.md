# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-hr-review.spec.ts >> 02 �?HR review page >> status banner shows PENDING_REVIEW
- Location: tests\attendance\02-hr-review.spec.ts:28:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/pending review/i).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText(/pending review/i).first()

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
  5   |   openDailyLogsForEmployee,
  6   | } from './helpers/attendance.helpers';
  7   | 
  8   | test.describe('02 �?HR review page', () => {
  9   |   test.beforeEach(async ({ page }) => {
  10  |     await loginAs(
  11  |       page,
  12  |       'jinxia.dong@company.local',
  13  |       'Admin@12345',
  14  |       REVIEW_URL,
  15  |     );
  16  |     if (!page.url().includes('/hr/attendance/review/')) {
  17  |       await page.goto(REVIEW_URL);
  18  |     }
  19  |     await expect(page.getByText(/review august 2026|august 2026|pending review|reviewed|approved/i).first()).toBeVisible({
  20  |       timeout: 30_000,
  21  |     });
  22  |   });
  23  | 
  24  |   test('review page loads at /hr/attendance/review/8/2026', async ({ page }) => {
  25  |     await expect(page).toHaveURL(/\/hr\/attendance\/review\/8\/2026/);
  26  |   });
  27  | 
  28  |   test('status banner shows PENDING_REVIEW', async ({ page }) => {
> 29  |     await expect(page.getByText(/pending review/i).first()).toBeVisible();
      |                                                             ^ Error: expect(locator).toBeVisible() failed
  30  |   });
  31  | 
  32  |   test('summary cards show correct employee and flagged day counts', async ({
  33  |     page,
  34  |   }) => {
  35  |     await expect(page.getByText(/total employees/i)).toBeVisible();
  36  |     await expect(page.getByText(/employees with flags/i)).toBeVisible();
  37  |     await expect(page.getByText(/total flagged days/i)).toBeVisible();
  38  |   });
  39  | 
  40  |   test('employee table shows all imported employees', async ({ page }) => {
  41  |     const rows = page.locator('.ant-table-tbody .ant-table-row');
  42  |     await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  43  |     const count = await rows.count();
  44  |     expect(count).toBeGreaterThan(20);
  45  |   });
  46  | 
  47  |   test('employees with flagged days show amber badge', async ({ page }) => {
  48  |     await expect(
  49  |       page.getByText(/has flags/i).first(),
  50  |     ).toBeVisible({ timeout: 20_000 });
  51  |   });
  52  | 
  53  |   test('employees with no flagged days show green badge', async ({ page }) => {
  54  |     await expect(
  55  |       page.getByText(/no flags/i).first(),
  56  |     ).toBeVisible({ timeout: 20_000 });
  57  |   });
  58  | 
  59  |   test('View Daily Logs button opens drawer for an employee', async ({
  60  |     page,
  61  |   }) => {
  62  |     await page.getByRole('button', { name: /view daily logs/i }).first().click();
  63  |     await expect(page.getByText(/daily logs/i).first()).toBeVisible({
  64  |       timeout: 15_000,
  65  |     });
  66  |   });
  67  | 
  68  |   test('daily logs drawer shows all days for the month', async ({ page }) => {
  69  |     await page.getByRole('button', { name: /view daily logs/i }).first().click();
  70  |     const dayRows = page.locator('.ant-drawer .ant-table-row');
  71  |     await expect(dayRows.first()).toBeVisible({ timeout: 15_000 });
  72  |     const count = await dayRows.count();
  73  |     expect(count).toBeGreaterThanOrEqual(28);
  74  |   });
  75  | 
  76  |   test('holidays show correctly �?Aug 25 shows as HOLIDAY', async ({ page }) => {
  77  |     await openDailyLogsForEmployee(page, /samuel/i);
  78  |     const holidayRow = page
  79  |       .locator('.ant-drawer .ant-table-row')
  80  |       .filter({ hasText: /25/ })
  81  |       .filter({ hasText: /holiday/i });
  82  |     await expect(holidayRow.first()).toBeVisible({ timeout: 15_000 });
  83  |     await expect(holidayRow.first().getByText(/missing clock/i)).toHaveCount(0);
  84  |   });
  85  | 
  86  |   test('weekend days show as WEEKEND status', async ({ page }) => {
  87  |     await openDailyLogsForEmployee(page, /samuel/i);
  88  |     const weekendRow = page
  89  |       .locator('.ant-drawer .ant-table-row')
  90  |       .filter({ hasText: /weekend/i })
  91  |       .first();
  92  |     await expect(weekendRow).toBeVisible({ timeout: 15_000 });
  93  |   });
  94  | 
  95  |   test('flagged days show correct flag chips', async ({ page }) => {
  96  |     await openDailyLogsForEmployee(page, /samuel/i);
  97  |     await expect(
  98  |       page
  99  |         .locator('.ant-drawer')
  100 |         .getByText(/missing clock out/i)
  101 |         .first(),
  102 |     ).toBeVisible({ timeout: 15_000 });
  103 |   });
  104 | 
  105 |   test('last export day (Aug 31) shows no MISSING_CLOCK_OUT flag', async ({
  106 |     page,
  107 |   }) => {
  108 |     await openDailyLogsForEmployee(page, /samuel/i);
  109 |     const aug31 = page
  110 |       .locator('.ant-drawer .ant-table-row')
  111 |       .filter({ hasText: /31/ })
  112 |       .first();
  113 |     await expect(aug31).toBeVisible({ timeout: 15_000 });
  114 |     const flagText = await aug31.innerText();
  115 |     expect(flagText.toLowerCase()).not.toMatch(/missing clock out/);
  116 |   });
  117 | 
  118 |   test('clock times show in local Ethiopia time not machine time', async ({
  119 |     page,
  120 |   }) => {
  121 |     await openDailyLogsForEmployee(page, /samuel/i);
  122 |     const drawer = page.locator('.ant-drawer');
  123 |     const times = await drawer.locator('td').allInnerTexts();
  124 |     const hasMorning = times.some((t) => /^0[6-9]:\d{2}$/.test(t.trim()));
  125 |     const hasMachineNoon = times.some((t) => /^1[2-4]:\d{2}$/.test(t.trim()));
  126 |     expect(hasMorning || !hasMachineNoon).toBeTruthy();
  127 |   });
  128 | 
  129 |   test('HR can correct a daily log entry', async ({ page }) => {
```