# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-hr-approval.spec.ts >> 03 �?HR monthly approval >> re-approving after unlock works correctly
- Location: tests\attendance\03-hr-approval.spec.ts:115:7

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: locator.click: Test timeout of 45000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /approve month/i })

```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - generic [ref=f2e5]:
    - link "Skip to main content" [ref=f2e6] [cursor=pointer]:
      - /url: "#main-content"
    - navigation "Main navigation" [ref=f2e7]:
      - generic [ref=f2e8]:
        - link "CCECC workspace" [ref=f2e10] [cursor=pointer]:
          - /url: /
          - img "CCECC" [ref=f2e12]
          - generic [ref=f2e13]: CCECC
        - generic [ref=f2e15]:
          - generic [ref=f2e16]: Find a module
          - generic [ref=f2e17]:
            - searchbox "Find a module" [ref=f2e18]
            - generic: Ctrl K
          - paragraph [ref=f2e19]
        - list [ref=f2e21]:
          - listitem [ref=f2e22]:
            - link "Dashboard" [ref=f2e23] [cursor=pointer]:
              - /url: /
          - listitem [ref=f2e29]:
            - link "New Request" [ref=f2e30] [cursor=pointer]:
              - /url: /approvals/new
          - listitem [ref=f2e36]:
            - button "Human Resources" [ref=f2e37] [cursor=pointer]
          - listitem [ref=f2e48]:
            - button "Organization" [ref=f2e49] [cursor=pointer]
        - list [ref=f2e59]:
          - listitem [ref=f2e60]:
            - link "Approvals 36 pending approvals" [ref=f2e61] [cursor=pointer]:
              - /url: /approvals
              - generic [ref=f2e66]: Approvals
              - generic [ref=f2e67]:
                - generic [ref=f2e68]: "36"
                - generic [ref=f2e69]: 36 pending approvals
          - listitem [ref=f2e70]:
            - link "My Profile" [ref=f2e71] [cursor=pointer]:
              - /url: /profile
          - listitem [ref=f2e78]:
            - link "Settings" [ref=f2e79] [cursor=pointer]:
              - /url: /settings
        - button "Collapse sidebar" [ref=f2e86] [cursor=pointer]
    - main [ref=f2e92]:
      - generic [ref=f2e94]:
        - heading "Dashboard" [level=1] [ref=f2e97]
        - generic [ref=f2e99]:
          - button "Switch to 中文" [ref=f2e101] [cursor=pointer]:
            - img "global" [ref=f2e103]
            - generic [ref=f2e106]: EN
          - button "Open notifications" [ref=f2e107]:
            - generic [ref=f2e108]:
              - img "bell" [ref=f2e109]
              - superscript [ref=f2e112]:
                - generic [ref=f2e113]:
                  - generic [ref=f2e114]: "3"
                  - generic [ref=f2e115]: "9"
          - button "Open profile" [ref=f2e116]:
            - generic [ref=f2e117]: J
            - generic [ref=f2e119]:
              - paragraph [ref=f2e120]: Jinxia Dong (董锦霞)
              - paragraph [ref=f2e121]: HR Officer
      - generic [ref=f2e124]:
        - generic [ref=f2e125]:
          - paragraph [ref=f2e126]: HR Dashboard · Thursday, 24 September 2026
          - heading "Good morning, Jinxia" [level=1] [ref=f2e127]
        - generic [ref=f2e128]:
          - link [ref=f2e129] [cursor=pointer]:
            - /url: /users
            - img "team" [ref=f2e131]
            - generic [ref=f2e134]:
              - paragraph [ref=f2e135]: Employees
              - paragraph [ref=f2e136]: "137"
          - link [ref=f2e137] [cursor=pointer]:
            - /url: /hr/leave-requests
            - img "calendar" [ref=f2e139]
            - generic [ref=f2e142]:
              - paragraph [ref=f2e143]: On leave
              - paragraph [ref=f2e144]: "0"
              - paragraph [ref=f2e145]: This week
          - link [ref=f2e146] [cursor=pointer]:
            - /url: /hr/leave-requests
            - img "clock-circle" [ref=f2e148]
            - generic [ref=f2e152]:
              - paragraph [ref=f2e153]: Pending leave
              - paragraph [ref=f2e154]: "4"
          - link [ref=f2e155] [cursor=pointer]:
            - /url: /hr/overtime
            - img "field-time" [ref=f2e157]
            - generic [ref=f2e161]:
              - paragraph [ref=f2e162]: Pending overtime
              - paragraph [ref=f2e163]: "3"
        - generic [ref=f2e164]:
          - link [ref=f2e165] [cursor=pointer]:
            - /url: /hr/flight-applications
            - img "send" [ref=f2e167]
            - generic [ref=f2e170]:
              - paragraph [ref=f2e171]: Flight tickets
              - paragraph [ref=f2e172]: "9"
              - paragraph [ref=f2e173]: Booking required
          - link [ref=f2e174] [cursor=pointer]:
            - /url: /hr/employee-contract
            - img "file" [ref=f2e176]
            - generic [ref=f2e179]:
              - paragraph [ref=f2e180]: Contracts expiring
              - paragraph [ref=f2e181]: "0"
              - paragraph [ref=f2e182]: Within 90 days
          - link [ref=f2e183] [cursor=pointer]:
            - /url: /users
            - img "warning" [ref=f2e185]
            - generic [ref=f2e188]:
              - paragraph [ref=f2e189]: No leave policy
              - paragraph [ref=f2e190]: "134"
              - paragraph [ref=f2e191]: Needs assignment
        - generic [ref=f2e192]:
          - generic [ref=f2e194]:
            - generic [ref=f2e196]:
              - img "calendar" [ref=f2e198]
              - generic [ref=f2e201]:
                - heading "Leave request trend" [level=3] [ref=f2e202]
                - paragraph [ref=f2e203]: Approved vs rejected over 6 months
            - generic [ref=f2e206]:
              - list [ref=f2e208]:
                - listitem [ref=f2e209]:
                  - img "Approved legend icon" [ref=f2e210]
                  - generic [ref=f2e212]: Approved
                - listitem [ref=f2e213]:
                  - img "Rejected legend icon" [ref=f2e214]
                  - generic [ref=f2e216]: Rejected
                - listitem [ref=f2e217]:
                  - img "Total legend icon" [ref=f2e218]
                  - generic [ref=f2e220]: Total
              - application [ref=f2e221]:
                - generic [ref=f2e252]:
                  - generic [ref=f2e253]:
                    - generic [ref=f2e254]: Apr 2026
                    - generic [ref=f2e256]: May 2026
                    - generic [ref=f2e258]: Jun 2026
                    - generic [ref=f2e260]: Jul 2026
                    - generic [ref=f2e262]: Aug 2026
                    - generic [ref=f2e264]: Sep 2026
                  - generic [ref=f2e266]:
                    - generic [ref=f2e267]: "0"
                    - generic [ref=f2e269]: "3"
                    - generic [ref=f2e271]: "6"
                    - generic [ref=f2e273]: "9"
                    - generic [ref=f2e275]: "12"
          - generic [ref=f2e278]:
            - generic [ref=f2e280]:
              - img "calendar" [ref=f2e282]
              - generic [ref=f2e285]:
                - heading "Leave mix" [level=3] [ref=f2e286]
                - paragraph [ref=f2e287]: Last 6 months by type
            - generic [ref=f2e289]:
              - generic [ref=f2e290]:
                - application [ref=f2e293]
                - generic:
                  - paragraph: "8"
                  - paragraph: Requests
              - generic [ref=f2e306]:
                - generic [ref=f2e307]:
                  - generic [ref=f2e308]: Annual
                  - generic [ref=f2e311]: 75%
                - generic [ref=f2e312]:
                  - generic [ref=f2e313]: Emergency
                  - generic [ref=f2e316]: 13%
                - generic [ref=f2e317]:
                  - generic [ref=f2e318]: Sick
                  - generic [ref=f2e321]: 13%
        - generic [ref=f2e322]:
          - generic [ref=f2e323]:
            - generic [ref=f2e325]:
              - img "clock-circle" [ref=f2e327]
              - generic [ref=f2e331]:
                - heading "Pending approvals" [level=3] [ref=f2e332]
                - paragraph [ref=f2e333]: 34 open across 11 modules
            - application [ref=f2e337]:
              - generic [ref=f2e378]:
                - generic [ref=f2e379]:
                  - generic [ref=f2e380]: Purchase Re…
                  - generic [ref=f2e382]: Vehicle App…
                  - generic [ref=f2e384]: Third-Count…
                  - generic [ref=f2e386]: Material Re…
                  - generic [ref=f2e388]: Office Vehi…
                  - generic [ref=f2e390]: Low-Value C…
                  - generic [ref=f2e392]: Expense Cla…
                  - generic [ref=f2e394]: Flight Appl…
                  - generic [ref=f2e396]: Overtime Ap…
                  - generic [ref=f2e398]: Per Diem Re…
                  - generic [ref=f2e400]: Leave Reque…
                - generic [ref=f2e402]:
                  - generic [ref=f2e403]: "0"
                  - generic [ref=f2e405]: "1"
                  - generic [ref=f2e407]: "2"
                  - generic [ref=f2e409]: "3"
                  - generic [ref=f2e411]: "4"
                - generic [ref=f2e413]:
                  - generic [ref=f2e414]: "4"
                  - generic [ref=f2e415]: "4"
                  - generic [ref=f2e416]: "4"
                  - generic [ref=f2e417]: "4"
                  - generic [ref=f2e418]: "3"
                  - generic [ref=f2e419]: "3"
                  - generic [ref=f2e420]: "3"
                  - generic [ref=f2e421]: "3"
                  - generic [ref=f2e422]: "2"
                  - generic [ref=f2e423]: "2"
                  - generic [ref=f2e424]: "2"
          - generic [ref=f2e425]:
            - generic [ref=f2e427]:
              - img "team" [ref=f2e429]
              - generic [ref=f2e432]:
                - heading "Headcount" [level=3] [ref=f2e433]
                - paragraph [ref=f2e434]: Active employees by department
            - application [ref=f2e438]:
              - generic [ref=f2e458]:
                - generic [ref=f2e459]:
                  - generic [ref=f2e460]: "0"
                  - generic [ref=f2e462]: "3"
                  - generic [ref=f2e464]: "6"
                  - generic [ref=f2e466]: "9"
                  - generic [ref=f2e468]: "12"
                - generic [ref=f2e470]:
                  - generic [ref=f2e471]: Others
                  - generic [ref=f2e473]: ArchitecturalDes…
                  - generic [ref=f2e475]: MunicipalTranspo…
                  - generic [ref=f2e477]: AdministrativeDe…
        - generic [ref=f2e479]:
          - generic [ref=f2e480]:
            - generic [ref=f2e481]:
              - generic [ref=f2e482]:
                - img "calendar" [ref=f2e484]
                - heading "Recent leave" [level=3] [ref=f2e488]
              - link "View all →" [ref=f2e489] [cursor=pointer]:
                - /url: /hr/leave-requests
            - generic [ref=f2e491]:
              - generic [ref=f2e492]:
                - generic [ref=f2e493]:
                  - generic [ref=f2e494]: ET
                  - generic [ref=f2e496]:
                    - paragraph [ref=f2e497]: Eyuel Tilahun
                    - paragraph [ref=f2e498]: Annual · 4d · 05/09/2026
                - generic [ref=f2e499]: Submitted
              - generic [ref=f2e500]:
                - generic [ref=f2e501]:
                  - generic [ref=f2e502]: HA
                  - generic [ref=f2e504]:
                    - paragraph [ref=f2e505]: Hassan Al-Rashid
                    - paragraph [ref=f2e506]: Annual · 3d · 01/10/2026
                - generic [ref=f2e507]: Submitted
              - generic [ref=f2e508]:
                - generic [ref=f2e509]:
                  - generic [ref=f2e510]: HA
                  - generic [ref=f2e512]:
                    - paragraph [ref=f2e513]: Hassan Al-Rashid
                    - paragraph [ref=f2e514]: Unpaid · 5d · 25/08/2026
                - generic [ref=f2e515]: Rejected
              - generic [ref=f2e516]:
                - generic [ref=f2e517]:
                  - generic [ref=f2e518]: KN
                  - generic [ref=f2e520]:
                    - paragraph [ref=f2e521]: Khalid Nasser
                    - paragraph [ref=f2e522]: Annual · 5d · 10/09/2026
                - generic [ref=f2e523]: Submitted
              - generic [ref=f2e524]:
                - generic [ref=f2e525]:
                  - generic [ref=f2e526]: KN
                  - generic [ref=f2e528]:
                    - paragraph [ref=f2e529]: Khalid Nasser
                    - paragraph [ref=f2e530]: Sick · 3d · 05/08/2026
                - generic [ref=f2e531]: Returned
              - generic [ref=f2e532]:
                - generic [ref=f2e533]:
                  - generic [ref=f2e534]: NS
                  - generic [ref=f2e536]:
                    - paragraph [ref=f2e537]: Nadia Saleh
                    - paragraph [ref=f2e538]: Emergency · 1d · 28/07/2026
                - generic [ref=f2e539]: Approved
              - generic [ref=f2e540]:
                - generic [ref=f2e541]:
                  - generic [ref=f2e542]: NS
                  - generic [ref=f2e544]:
                    - paragraph [ref=f2e545]: Nadia Saleh
                    - paragraph [ref=f2e546]: Annual · 3d · 18/08/2026
                - generic [ref=f2e547]: Approved
              - generic [ref=f2e548]:
                - generic [ref=f2e549]:
                  - generic [ref=f2e550]: WC
                  - generic [ref=f2e552]:
                    - paragraph [ref=f2e553]: Wei Chen
                    - paragraph [ref=f2e554]: Annual · 5d · 01/09/2026
                - generic [ref=f2e555]: In Review
          - generic [ref=f2e556]:
            - generic [ref=f2e558]:
              - img "send" [ref=f2e560]
              - generic [ref=f2e563]:
                - heading "Upcoming travel" [level=3] [ref=f2e564]
                - paragraph [ref=f2e565]: Next 30 days
            - paragraph [ref=f2e567]: No upcoming travel
  - button "Open Next.js Dev Tools" [ref=f2e573] [cursor=pointer]
  - alert [ref=f2e577]
  - generic [ref=f2e578]: Others
```

# Test source

```ts
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
> 117 |     await page.getByRole('button', { name: /approve month/i }).click();
      |                                                                ^ Error: locator.click: Test timeout of 45000ms exceeded.
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