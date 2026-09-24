# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-hr-approval.spec.ts >> 03 �?HR monthly approval >> corrections possible again after unlock
- Location: tests\attendance\03-hr-approval.spec.ts:104:7

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