# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-import.spec.ts >> 01 �?Attendance import >> overwrite confirmation replaces existing data
- Location: tests\attendance\01-import.spec.ts:217:7

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/import complete/i)
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 90000ms
  - waiting for getByText(/import complete/i)
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
  - heading "Attendance" [level=1]
  - paragraph: Monthly attendance imported from Deli e+ clock records.
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
        - listitem: Attendance
  - img "team"
  - paragraph: Employees
  - paragraph: "0"
  - img "calendar"
  - paragraph: Total Present Days
  - paragraph: "0"
  - img "close-circle"
  - paragraph: Total Absent Days
  - paragraph: "0"
  - img "clock-circle"
  - paragraph: Total Late Days
  - paragraph: "0"
  - img "warning"
  - paragraph: Missing Clock-outs
  - paragraph: "0"
  - heading "Attendance" [level=3]
  - text: "0"
  - button "Refresh":
    - img "reload"
  - button "check-circle Review September 2026":
    - img "check-circle"
    - text: Review September 2026
  - button "import Import Attendance":
    - img "import"
    - text: Import Attendance
  - img "search"
  - textbox "Search employee"
  - text: Employee
  - combobox "Employee"
  - img "down"
  - text: September
  - combobox "Month"
  - img "down"
  - spinbutton "Year": "2026"
  - button "Increase Value":
    - img "up"
  - button "Decrease Value":
    - img "down"
  - table:
    - rowgroup:
      - row "Employee Department Scheduled Days Present Days Absent Days Attendance % Late Days Missing Clock-out Payable Hours":
        - columnheader "Employee"
        - columnheader "Department"
        - columnheader "Scheduled Days"
        - columnheader "Present Days"
        - columnheader "Absent Days"
        - columnheader "Attendance %"
        - columnheader "Late Days"
        - columnheader "Missing Clock-out"
        - columnheader "Payable Hours"
    - rowgroup:
      - row "calendar No attendance data for September 2026. Import the monthly export from Deli e+ to get started.":
        - cell "calendar No attendance data for September 2026. Import the monthly export from Deli e+ to get started.":
          - img "calendar"
          - paragraph: No attendance data for September 2026.
          - paragraph: Import the monthly export from Deli e+ to get started.
- alert
- dialog "Import Attendance":
  - button "Close":
    - img "close"
  - text: Import Attendance
  - img "check"
  - text: Upload File 2 Review & Confirm 3 Done
  - paragraph: Attendance data for August 2026 has already been imported.
  - paragraph: Imported on 23/09/2026 16:16. Confirming will replace all 65 existing records for this month.
  - paragraph: Attendance data for August 2026
  - text: August_Attendance__2_.xlsx
  - button "collapsed check-circle Matched 5 7":
    - img "collapsed"
    - img "check-circle"
    - text: Matched
    - superscript: 5 7
  - button "expanded warning Needs Review 7" [expanded]:
    - img "expanded"
    - img "warning"
    - text: Needs Review
    - superscript: "7"
  - table:
    - rowgroup:
      - row "Attendance Name Best Match Employee ID Score Include Assign":
        - columnheader "Attendance Name"
        - columnheader "Best Match"
        - columnheader "Employee ID"
        - columnheader "Score"
        - columnheader "Include"
        - columnheader "Assign"
  - table:
    - rowgroup:
      - row "Aemias Habtu Armias Habtu EM-010 83% Change →":
        - cell "Aemias Habtu"
        - cell "Armias Habtu"
        - cell "EM-010"
        - cell "83%"
        - cell:
          - checkbox [checked]
        - cell "Change →":
          - button "Change →"
      - row "Etsegenet Estesegenet Degu EM-031 75% Change →":
        - cell "Etsegenet"
        - cell "Estesegenet Degu"
        - cell "EM-031"
        - cell "75%"
        - cell:
          - checkbox [checked]
        - cell "Change →":
          - button "Change →"
      - row "Mizan Beyene Mizen Beyene EM-073 83% Change →":
        - cell "Mizan Beyene"
        - cell "Mizen Beyene"
        - cell "EM-073"
        - cell "83%"
        - cell:
          - checkbox [checked]
        - cell "Change →":
          - button "Change →"
      - row "Shimeles Bacha Shimelis Bacha EM-098 85% Change →":
        - cell "Shimeles Bacha"
        - cell "Shimelis Bacha"
        - cell "EM-098"
        - cell "85%"
        - cell:
          - checkbox [checked]
        - cell "Change →":
          - button "Change →"
      - row "werknesh Torah Werknesh Tiruha EM-118 75% Change →":
        - cell "werknesh Torah"
        - cell "Werknesh Tiruha"
        - cell "EM-118"
        - cell "75%"
        - cell:
          - checkbox [checked]
        - cell "Change →":
          - button "Change →"
      - row "yemareshet Teme. Yemareshet Temesgen EM-128 86% Change →":
        - cell "yemareshet Teme."
        - cell "Yemareshet Temesgen"
        - cell "EM-128"
        - cell "86%"
        - cell:
          - checkbox [checked]
        - cell "Change →":
          - button "Change →"
      - row "Yishak Assefa Yisak Assefa EM-129 84% Change →":
        - cell "Yishak Assefa"
        - cell "Yisak Assefa"
        - cell "EM-129"
        - cell "84%"
        - cell:
          - checkbox [checked]
        - cell "Change →":
          - button "Change →"
  - button "expanded close-circle Not Matched 1 0" [expanded]:
    - img "expanded"
    - img "close-circle"
    - text: Not Matched
    - superscript: 1 0
  - table:
    - rowgroup:
      - row "Attendance Name ID in System Reason Assign":
        - columnheader "Attendance Name"
        - columnheader "ID in System"
        - columnheader "Reason"
        - columnheader "Assign"
  - table:
    - rowgroup:
      - row "Asli Mekonen — No matching employee found in ERP Assign Employee +":
        - cell "Asli Mekonen"
        - cell "—"
        - cell "No matching employee found in ERP"
        - cell "Assign Employee +":
          - button "Assign Employee +"
      - row "Dagim Selemon — No matching employee found in ERP Assign Employee +":
        - cell "Dagim Selemon"
        - cell "—"
        - cell "No matching employee found in ERP"
        - cell "Assign Employee +":
          - button "Assign Employee +"
      - row "Daniel Girma — No matching employee found in ERP Assign Employee +":
        - cell "Daniel Girma"
        - cell "—"
        - cell "No matching employee found in ERP"
        - cell "Assign Employee +":
          - button "Assign Employee +"
      - row "Feven Fantu — No matching employee found in ERP Assign Employee +":
        - cell "Feven Fantu"
        - cell "—"
        - cell "No matching employee found in ERP"
        - cell "Assign Employee +":
          - button "Assign Employee +"
      - row "Micheal Fetena — No matching employee found in ERP Assign Employee +":
        - cell "Micheal Fetena"
        - cell "—"
        - cell "No matching employee found in ERP"
        - cell "Assign Employee +":
          - button "Assign Employee +"
      - row "Mikias Lulseged — No matching employee found in ERP Assign Employee +":
        - cell "Mikias Lulseged"
        - cell "—"
        - cell "No matching employee found in ERP"
        - cell "Assign Employee +":
          - button "Assign Employee +"
      - row "Petros Fanta — No matching employee found in ERP Assign Employee +":
        - cell "Petros Fanta"
        - cell "—"
        - cell "No matching employee found in ERP"
        - cell "Assign Employee +":
          - button "Assign Employee +"
      - row "philipos Tamru — No matching employee found in ERP Assign Employee +":
        - cell "philipos Tamru"
        - cell "—"
        - cell "No matching employee found in ERP"
        - cell "Assign Employee +":
          - button "Assign Employee +"
      - row "Samuael H/mariam — No matching employee found in ERP Assign Employee +":
        - cell "Samuael H/mariam"
        - cell "—"
        - cell "No matching employee found in ERP"
        - cell "Assign Employee +":
          - button "Assign Employee +"
      - row "Zewdu Habte — No matching employee found in ERP Assign Employee +":
        - cell "Zewdu Habte"
        - cell "—"
        - cell "No matching employee found in ERP"
        - cell "Assign Employee +":
          - button "Assign Employee +"
  - paragraph: Assign an ERP employee to include them in this import, or leave blank to skip.
  - paragraph: 64 records will be imported · 0 will be skipped · 10 not matched
  - paragraph: Internal server error
  - button "Back"
  - button "Confirm Import"
```

# Test source

```ts
  127 |   });
  128 | 
  129 |   test('rejected row can be manually assigned to an employee', async ({
  130 |     page,
  131 |   }) => {
  132 |     await openImportModal(page);
  133 |     await uploadAttendanceFixture(page);
  134 |     await waitForImportPreview(page);
  135 | 
  136 |     const rejectedPanel = collapsePanelByTitle(page, /not matched/i);
  137 |     await rejectedPanel.locator('.ant-collapse-header').click();
  138 |     await expect(rejectedPanel).toHaveClass(/ant-collapse-item-active/);
  139 | 
  140 |     const assignBtn = rejectedPanel
  141 |       .getByRole('button', { name: /assign employee/i })
  142 |       .first();
  143 |     await assignBtn.click();
  144 | 
  145 |     const search = page.getByPlaceholder(/search employee/i).last();
  146 |     await search.fill('Samuel');
  147 |     await page.waitForTimeout(800);
  148 |     await page.getByText(/samuel hailemariam/i).first().click();
  149 | 
  150 |     await expect(
  151 |       rejectedPanel.getByText(/assigned/i).first(),
  152 |     ).toBeVisible({ timeout: 10_000 });
  153 |   });
  154 | 
  155 |   test('summary footer shows correct import count after toggles', async ({
  156 |     page,
  157 |   }) => {
  158 |     await openImportModal(page);
  159 |     await uploadAttendanceFixture(page);
  160 |     await waitForImportPreview(page);
  161 | 
  162 |     const footer = page.getByText(/records will be imported/i);
  163 |     await expect(footer).toBeVisible();
  164 |     const text = await footer.innerText();
  165 |     const importCount = Number(text.match(/(\d+)\s+records will be imported/i)?.[1] ?? 0);
  166 |     expect(importCount).toBeGreaterThan(50);
  167 |   });
  168 | 
  169 |   test('confirm import succeeds and shows result step', async ({ page }) => {
  170 |     await openImportModal(page);
  171 |     await uploadAttendanceFixture(page);
  172 |     await waitForImportPreview(page);
  173 | 
  174 |     await page.getByRole('button', { name: /confirm import/i }).click();
  175 | 
  176 |     const replaceBtn = page.getByRole('button', { name: /yes, replace/i });
  177 |     if (await replaceBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
  178 |       await replaceBtn.click();
  179 |     }
  180 | 
  181 |     await expect(page.getByText(/import complete/i)).toBeVisible({
  182 |       timeout: 90_000,
  183 |     });
  184 | 
  185 |     const autoMatched = page.getByText(/automatically matched/i);
  186 |     await expect(autoMatched).toBeVisible();
  187 |     const matchedText = await autoMatched.innerText();
  188 |     const matchedCount = Number(matchedText.match(/(\d+)/)?.[1] ?? 0);
  189 |     expect(matchedCount).toBeGreaterThan(50);
  190 | 
  191 |     const rejectedToggle = page.getByText(/employees not imported/i);
  192 |     if (await rejectedToggle.isVisible().catch(() => false)) {
  193 |       await rejectedToggle.click();
  194 |     }
  195 |   });
  196 | 
  197 |   test('list page refreshes after successful import', async ({ page }) => {
  198 |     await selectAttendancePeriod(page, TEST_MONTH, TEST_YEAR);
  199 |     await expect(
  200 |       page.locator('.ant-table-row').first(),
  201 |     ).toBeVisible({ timeout: 30_000 });
  202 |     await expect(page.getByText(new RegExp(TEST_MONTH_NAME, 'i')).first()).toBeVisible();
  203 |   });
  204 | 
  205 |   test('reimporting same month shows overwrite warning banner', async ({
  206 |     page,
  207 |   }) => {
  208 |     await openImportModal(page);
  209 |     await uploadAttendanceFixture(page);
  210 |     await waitForImportPreview(page);
  211 | 
  212 |     await expect(
  213 |       page.getByText(/has already been imported/i),
  214 |     ).toBeVisible({ timeout: 30_000 });
  215 |   });
  216 | 
  217 |   test('overwrite confirmation replaces existing data', async ({ page }) => {
  218 |     await openImportModal(page);
  219 |     await uploadAttendanceFixture(page);
  220 |     await waitForImportPreview(page);
  221 | 
  222 |     await page.getByRole('button', { name: /confirm import/i }).click();
  223 |     const replaceBtn = page.getByRole('button', { name: /yes, replace/i });
  224 |     await expect(replaceBtn).toBeVisible({ timeout: 10_000 });
  225 |     await replaceBtn.click();
  226 | 
> 227 |     await expect(page.getByText(/import complete/i)).toBeVisible({
      |                                                      ^ Error: expect(locator).toBeVisible() failed
  228 |       timeout: 90_000,
  229 |     });
  230 |   });
  231 | 
  232 |   test('monthly approval record created with PENDING_REVIEW status after import', async ({
  233 |     page,
  234 |   }) => {
  235 |     await page.goto(REVIEW_URL);
  236 |     await expect(
  237 |       page.getByText(/pending review/i).first(),
  238 |     ).toBeVisible({ timeout: 30_000 });
  239 |   });
  240 | });
  241 | 
```