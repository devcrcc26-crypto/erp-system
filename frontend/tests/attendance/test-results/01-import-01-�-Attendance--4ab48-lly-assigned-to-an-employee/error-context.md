# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-import.spec.ts >> 01 �?Attendance import >> rejected row can be manually assigned to an employee
- Location: tests\attendance\01-import.spec.ts:129:7

# Error details

```
Error: expect(locator).toHaveClass(expected) failed

Locator: locator('.ant-collapse-item').filter({ hasText: /not matched/i }).first()
Expected pattern: /ant-collapse-item-active/
Received string:  "ant-collapse-item"
Timeout: 5000ms

Call log:
  - Expect "toHaveClass" with timeout 5000ms
  - waiting for locator('.ant-collapse-item').filter({ hasText: /not matched/i }).first()
    14 × locator resolved to <div class="ant-collapse-item">…</div>
       - unexpected value "ant-collapse-item"

```

```yaml
- button "collapsed close-circle Not Matched 1 0":
  - img "collapsed"
  - img "close-circle"
  - text: Not Matched
  - superscript: 1 0
```

# Test source

```ts
  38  |   test('file upload triggers preview automatically', async ({ page }) => {
  39  |     await openImportModal(page);
  40  |     await uploadAttendanceFixture(page);
  41  |     await waitForImportPreview(page);
  42  |     await expect(page.getByText(/confirm import/i)).toBeVisible({
  43  |       timeout: 30_000,
  44  |     });
  45  |   });
  46  | 
  47  |   test('preview shows correct counts: ~56 matched, ~9 review, ~9 rejected', async ({
  48  |     page,
  49  |   }) => {
  50  |     await openImportModal(page);
  51  |     await uploadAttendanceFixture(page);
  52  |     await waitForImportPreview(page);
  53  | 
  54  |     const matched = collapsePanelByTitle(page, /matched/i);
  55  |     const review = collapsePanelByTitle(page, /needs review/i);
  56  |     const rejected = collapsePanelByTitle(page, /not matched/i);
  57  | 
  58  |     await expect(matched).toBeVisible();
  59  |     await expect(review).toBeVisible();
  60  |     await expect(rejected).toBeVisible();
  61  | 
  62  |     const matchedText = await matched.locator('.ant-collapse-header').innerText();
  63  |     const reviewText = await review.locator('.ant-collapse-header').innerText();
  64  |     const rejectedText = await rejected
  65  |       .locator('.ant-collapse-header')
  66  |       .innerText();
  67  | 
  68  |     const matchedCount = Number(matchedText.match(/(\d+)/)?.[1] ?? 0);
  69  |     const reviewCount = Number(reviewText.match(/(\d+)/)?.[1] ?? 0);
  70  |     const rejectedCount = Number(rejectedText.match(/(\d+)/)?.[1] ?? 0);
  71  | 
  72  |     // Observed against August_Attendance__2_.xlsx: 57 matched, 7 review, 10 rejected
  73  |     expect(matchedCount).toBeGreaterThanOrEqual(50);
  74  |     expect(matchedCount).toBeLessThanOrEqual(65);
  75  |     expect(reviewCount).toBeGreaterThanOrEqual(5);
  76  |     expect(reviewCount).toBeLessThanOrEqual(15);
  77  |     expect(rejectedCount).toBeGreaterThanOrEqual(5);
  78  |     expect(rejectedCount).toBeLessThanOrEqual(15);
  79  |   });
  80  | 
  81  |   test('review section is expanded by default', async ({ page }) => {
  82  |     await openImportModal(page);
  83  |     await uploadAttendanceFixture(page);
  84  |     await waitForImportPreview(page);
  85  |     await expectCollapseExpanded(collapsePanelByTitle(page, /needs review/i));
  86  |   });
  87  | 
  88  |   test('matched section is collapsed by default', async ({ page }) => {
  89  |     await openImportModal(page);
  90  |     await uploadAttendanceFixture(page);
  91  |     await waitForImportPreview(page);
  92  |     await expectCollapseCollapsed(collapsePanelByTitle(page, /^matched/i));
  93  |   });
  94  | 
  95  |   test('rejected section is expanded by default when unmatched rows exist', async ({
  96  |     page,
  97  |   }) => {
  98  |     // App behavior: defaultActiveKeys includes 'rejected' when preview.rejected.length > 0
  99  |     // (prompt expected collapsed — documented as finding in TEST-REPORT)
  100 |     await openImportModal(page);
  101 |     await uploadAttendanceFixture(page);
  102 |     await waitForImportPreview(page);
  103 |     await expectCollapseExpanded(collapsePanelByTitle(page, /not matched/i));
  104 |   });
  105 | 
  106 |   test('review row toggle deselects a row and updates summary count', async ({
  107 |     page,
  108 |   }) => {
  109 |     await openImportModal(page);
  110 |     await uploadAttendanceFixture(page);
  111 |     await waitForImportPreview(page);
  112 | 
  113 |     const footerBefore = await page
  114 |       .getByText(/records will be imported/i)
  115 |       .innerText();
  116 |     const beforeCount = Number(footerBefore.match(/(\d+)\s+records will be imported/i)?.[1] ?? 0);
  117 | 
  118 |     const reviewPanel = collapsePanelByTitle(page, /needs review/i);
  119 |     const checkbox = reviewPanel.locator('.ant-checkbox-input').first();
  120 |     await checkbox.click({ force: true });
  121 | 
  122 |     const footerAfter = await page
  123 |       .getByText(/records will be imported/i)
  124 |       .innerText();
  125 |     const afterCount = Number(footerAfter.match(/(\d+)\s+records will be imported/i)?.[1] ?? 0);
  126 |     expect(afterCount).toBeLessThan(beforeCount);
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
> 138 |     await expect(rejectedPanel).toHaveClass(/ant-collapse-item-active/);
      |                                 ^ Error: expect(locator).toHaveClass(expected) failed
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
  227 |     await expect(page.getByText(/import complete/i)).toBeVisible({
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
```