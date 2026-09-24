# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-hr-review.spec.ts >> 02 �?HR review page >> last export day (Aug 31) shows no MISSING_CLOCK_OUT flag
- Location: tests\attendance\02-hr-review.spec.ts:105:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.ant-table-row').filter({ hasText: /samuel/i }).first()
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for locator('.ant-table-row').filter({ hasText: /samuel/i }).first()

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
  23  | 
  24  | export const TEST_FILE_PATH = path.resolve(
  25  |   __dirname,
  26  |   '../fixtures/August_Attendance__2_.xlsx',
  27  | );
  28  | 
  29  | export const REVIEW_URL = `/hr/attendance/review/${TEST_MONTH}/${TEST_YEAR}`;
  30  | export const ATTENDANCE_LIST_URL = '/hr/attendance';
  31  | export const FIELD_MOVEMENT_LIST_URL = '/hr/field-movement-logs';
  32  | 
  33  | /**
  34  |  * Selects month/year filters on the HR attendance list page.
  35  |  */
  36  | export async function selectAttendancePeriod(
  37  |   page: Page,
  38  |   month: number = TEST_MONTH,
  39  |   year: number = TEST_YEAR,
  40  | ): Promise<void> {
  41  |   const monthSelect = page.getByLabel(/month/i).first();
  42  |   if (await monthSelect.isVisible().catch(() => false)) {
  43  |     await monthSelect.click();
  44  |     await page
  45  |       .getByRole('option', { name: new RegExp(MONTH_NAMES[month - 1], 'i') })
  46  |       .click();
  47  |   }
  48  | 
  49  |   const yearInput = page.getByLabel(/year/i).first();
  50  |   if (await yearInput.isVisible().catch(() => false)) {
  51  |     await yearInput.fill(String(year));
  52  |     await yearInput.blur();
  53  |   }
  54  | 
  55  |   await page.waitForTimeout(800);
  56  | }
  57  | 
  58  | /**
  59  |  * Opens the Import Attendance modal from the list page.
  60  |  */
  61  | export async function openImportModal(page: Page): Promise<void> {
  62  |   await page.getByRole('button', { name: /import attendance/i }).click();
  63  |   await expect(
  64  |     page.getByRole('dialog').filter({ hasText: /import attendance/i }),
  65  |   ).toBeVisible({ timeout: 15_000 });
  66  | }
  67  | 
  68  | /**
  69  |  * Uploads the August fixture into the import modal dropzone.
  70  |  */
  71  | export async function uploadAttendanceFixture(page: Page): Promise<void> {
  72  |   const dialog = page.getByRole('dialog').filter({ hasText: /import attendance/i });
  73  |   const fileInput = dialog.locator('input[type="file"]');
  74  |   await fileInput.setInputFiles(TEST_FILE_PATH);
  75  | }
  76  | 
  77  | /**
  78  |  * Waits until the import preview review step is visible.
  79  |  */
  80  | export async function waitForImportPreview(page: Page): Promise<void> {
  81  |   await expect(
  82  |     page.getByText(/needs review|matched|not matched/i).first(),
  83  |   ).toBeVisible({ timeout: 60_000 });
  84  | }
  85  | 
  86  | /**
  87  |  * Opens the profile Attendance tab (optionally with month/year query).
  88  |  */
  89  | export async function goToProfileAttendance(
  90  |   page: Page,
  91  |   month?: number,
  92  |   year?: number,
  93  | ): Promise<void> {
  94  |   const params = new URLSearchParams();
  95  |   params.set('tab', 'attendance');
  96  |   if (month != null) {
  97  |     params.set('month', String(month));
  98  |   }
  99  |   if (year != null) {
  100 |     params.set('year', String(year));
  101 |   }
  102 |   await page.goto(`/profile?${params.toString()}`);
  103 |   await expect(page.getByRole('tab', { name: /attendance/i })).toBeVisible({
  104 |     timeout: 20_000,
  105 |   });
  106 |   const tab = page.getByRole('tab', { name: /attendance/i });
  107 |   if ((await tab.getAttribute('aria-selected')) !== 'true') {
  108 |     await tab.click();
  109 |   }
  110 | }
  111 | 
  112 | /**
  113 |  * Opens daily logs drawer for the first matching employee row containing `name`.
  114 |  */
  115 | export async function openDailyLogsForEmployee(
  116 |   page: Page,
  117 |   employeeName: string | RegExp,
  118 | ): Promise<void> {
  119 |   const row = page
  120 |     .locator('.ant-table-row')
  121 |     .filter({ hasText: employeeName })
  122 |     .first();
> 123 |   await expect(row).toBeVisible({ timeout: 20_000 });
      |                     ^ Error: expect(locator).toBeVisible() failed
  124 |   await row.getByRole('button', { name: /view daily logs/i }).click();
  125 |   await expect(page.getByText(/daily logs/i).first()).toBeVisible({
  126 |     timeout: 15_000,
  127 |   });
  128 | }
  129 | 
  130 | /**
  131 |  * Returns a locator for an Ant Design collapse panel by its header text.
  132 |  */
  133 | export function collapsePanelByTitle(
  134 |   page: Page,
  135 |   title: RegExp | string,
  136 | ): Locator {
  137 |   return page.locator('.ant-collapse-item').filter({ hasText: title }).first();
  138 | }
  139 | 
  140 | /**
  141 |  * Asserts a collapse panel is expanded (active).
  142 |  */
  143 | export async function expectCollapseExpanded(
  144 |   panel: Locator,
  145 | ): Promise<void> {
  146 |   await expect(panel).toHaveClass(/ant-collapse-item-active/);
  147 | }
  148 | 
  149 | /**
  150 |  * Asserts a collapse panel is collapsed.
  151 |  */
  152 | export async function expectCollapseCollapsed(
  153 |   panel: Locator,
  154 | ): Promise<void> {
  155 |   await expect(panel).not.toHaveClass(/ant-collapse-item-active/);
  156 | }
  157 | 
  158 | /**
  159 |  * Clicks the notification bell and opens the first matching notification.
  160 |  */
  161 | export async function openNotificationMatching(
  162 |   page: Page,
  163 |   subject: RegExp,
  164 | ): Promise<void> {
  165 |   const bell = page
  166 |     .locator('button')
  167 |     .filter({ has: page.locator('.anticon-bell, [aria-label*="otification" i]') })
  168 |     .first();
  169 |   const bellFallback = page.getByRole('button', { name: /notification/i }).first();
  170 |   if (await bell.isVisible().catch(() => false)) {
  171 |     await bell.click();
  172 |   } else {
  173 |     await bellFallback.click();
  174 |   }
  175 |   await expect(page.getByText(subject).first()).toBeVisible({ timeout: 20_000 });
  176 |   await page.getByText(subject).first().click();
  177 | }
  178 | 
  179 | /**
  180 |  * Approvals inbox helpers.
  181 |  */
  182 | export async function goToPendingMyAction(page: Page): Promise<void> {
  183 |   await page.goto('/approvals');
  184 |   const pendingTab = page.getByRole('tab', { name: /pending my action/i });
  185 |   if (await pendingTab.isVisible().catch(() => false)) {
  186 |     await pendingTab.click();
  187 |   } else {
  188 |     const link = page.getByRole('link', { name: /pending my action/i });
  189 |     if (await link.isVisible().catch(() => false)) {
  190 |       await link.click();
  191 |     }
  192 |   }
  193 | }
  194 | 
  195 | export async function goToMyRequests(page: Page): Promise<void> {
  196 |   await page.goto('/approvals');
  197 |   const tab = page.getByRole('tab', { name: /my requests/i });
  198 |   if (await tab.isVisible().catch(() => false)) {
  199 |     await tab.click();
  200 |   } else {
  201 |     const link = page.getByRole('link', { name: /my requests/i });
  202 |     if (await link.isVisible().catch(() => false)) {
  203 |       await link.click();
  204 |     }
  205 |   }
  206 | }
  207 | 
```