# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-import.spec.ts >> 01 �?Attendance import >> monthly approval record created with PENDING_REVIEW status after import
- Location: tests\attendance\01-import.spec.ts:232:7

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/pending review/i).first()
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByText(/pending review/i).first()
  - Test timeout of 45000ms exceeded.

```

```yaml
- alert
```

# Test source

```ts
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
> 238 |     ).toBeVisible({ timeout: 30_000 });
      |       ^ Error: expect(locator).toBeVisible() failed
  239 |   });
  240 | });
  241 | 
```