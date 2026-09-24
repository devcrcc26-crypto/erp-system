# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 05-field-movement-form.spec.ts >> 05 �?Field movement form >> submitting creates FM-XXXX log and navigates to confirmation
- Location: tests\attendance\05-field-movement-form.spec.ts:157:7

# Error details

```
Error: Login failed for samuel.hailemariam@company.local: HTTP 401
```

# Page snapshot

```yaml
- generic [ref=f1e1]:
  - generic [ref=f1e5]:
    - banner [ref=f1e6]:
      - generic [ref=f1e7]:
        - img "CCECC" [ref=f1e9]
        - generic [ref=f1e10]:
          - generic [ref=f1e11]: CCECC
          - generic [ref=f1e12]: Construction ERP
    - main [ref=f1e13]:
      - generic [ref=f1e14]:
        - generic [ref=f1e16]:
          - heading "Sign in" [level=1] [ref=f1e17]
          - paragraph [ref=f1e18]: Enter your email and password to continue
          - generic [ref=f1e19]:
            - generic [ref=f1e21]:
              - generic "Email" [ref=f1e23]
              - textbox "Email" [ref=f1e27]:
                - /placeholder: name@company.com
                - text: samuel.hailemariam@company.local
            - generic [ref=f1e29]:
              - generic "Password" [ref=f1e31]
              - generic [ref=f1e35]:
                - textbox "Password" [ref=f1e36]: Admin@12345
                - button "Show" [ref=f1e38] [cursor=pointer]:
                  - img "eye-invisible" [ref=f1e39]
            - alert [ref=f1e43]:
              - paragraph [ref=f1e50]: Invalid email or password
            - button "loading Sign in" [active] [ref=f1e56] [cursor=pointer]:
              - generic:
                - img "loading"
              - generic [ref=f1e57]: Sign in
          - paragraph [ref=f1e58]:
            - link "Forgot password?" [ref=f1e59] [cursor=pointer]:
              - /url: /forgot-password
        - complementary "Demo access" [ref=f1e60]:
          - generic [ref=f1e61]:
            - generic [ref=f1e62]:
              - paragraph [ref=f1e63]: Demo access
              - paragraph [ref=f1e64]: Click an account to fill email and password
            - generic [ref=f1e65]:
              - button "Employee Eyuel Tilahun eyuel.tilahun@company.local" [ref=f1e66]:
                - generic [ref=f1e67]: Employee
                - generic [ref=f1e68]: Eyuel Tilahun
                - generic [ref=f1e69]: eyuel.tilahun@company.local
              - button "Discipline Leader Xiaoming Li xiaoming.li@company.local" [ref=f1e70]:
                - generic [ref=f1e71]: Discipline Leader
                - generic [ref=f1e72]: Xiaoming Li
                - generic [ref=f1e73]: xiaoming.li@company.local
              - button "HR Manager Jinxia Dong jinxia.dong@company.local" [ref=f1e74]:
                - generic [ref=f1e75]: HR Manager
                - generic [ref=f1e76]: Jinxia Dong
                - generic [ref=f1e77]: jinxia.dong@company.local
    - contentinfo [ref=f1e78]: © 2026 CCECC · Construction ERP
  - button "Open Next.js Dev Tools" [ref=f1e84] [cursor=pointer]
  - alert [ref=f1e88]
```

# Test source

```ts
  1   | import type { Page } from '@playwright/test';
  2   | import { expect } from '@playwright/test';
  3   | 
  4   | export const ATTENDANCE_USERS = {
  5   |   hrOfficer: {
  6   |     email: 'jinxia.dong@company.local',
  7   |     password: 'Admin@12345',
  8   |     name: 'Jinxia Dong',
  9   |   },
  10  |   employee: {
  11  |     email: 'demo.seed.designer@company.local',
  12  |     password: 'Admin@12345',
  13  |     name: 'Demo Designer',
  14  |   },
  15  |   supervisor: {
  16  |     email: 'xiaoming.li@company.local',
  17  |     password: 'Admin@12345',
  18  |     name: 'Xiaoming Li',
  19  |   },
  20  |   samuel: {
  21  |     email: 'samuel.hailemariam@company.local',
  22  |     password: 'Admin@12345',
  23  |     name: 'Samuel Hailemariam',
  24  |   },
  25  | } as const;
  26  | 
  27  | export type AttendanceUserKey = keyof typeof ATTENDANCE_USERS;
  28  | 
  29  | /**
  30  |  * Clears session storage and logs in with email/password.
  31  |  * Mirrors frontend/e2e/helpers/auth.ts, with stronger post-login readiness checks.
  32  |  */
  33  | export async function loginAs(
  34  |   page: Page,
  35  |   email: string,
  36  |   password: string,
  37  |   redirectTo = '/',
  38  | ): Promise<void> {
  39  |   await page.goto('/login');
  40  |   await page.evaluate(() => {
  41  |     localStorage.clear();
  42  |     sessionStorage.clear();
  43  |   });
  44  | 
  45  |   const from = encodeURIComponent(redirectTo);
  46  |   await page.goto(`/login?from=${from}`);
  47  | 
  48  |   const emailField = page.getByLabel(/^email$/i).first();
  49  |   await emailField.waitFor({ state: 'visible', timeout: 30_000 });
  50  |   await emailField.fill(email);
  51  | 
  52  |   const passwordField = page.getByLabel(/^password$/i).first();
  53  |   await passwordField.fill(password);
  54  | 
  55  |   const loginResponse = page.waitForResponse(
  56  |     (response) =>
  57  |       response.url().includes('/auth/login') &&
  58  |       response.request().method() === 'POST',
  59  |     { timeout: 45_000 },
  60  |   );
  61  | 
  62  |   await page.getByRole('button', { name: /^sign in$/i }).click();
  63  | 
  64  |   const response = await loginResponse.catch(() => null);
  65  |   if (response && !response.ok()) {
> 66  |     throw new Error(
      |           ^ Error: Login failed for samuel.hailemariam@company.local: HTTP 401
  67  |       `Login failed for ${email}: HTTP ${response.status()}`,
  68  |     );
  69  |   }
  70  | 
  71  |   await page.waitForURL(
  72  |     (url) => !url.pathname.startsWith('/login'),
  73  |     { timeout: 45_000 },
  74  |   );
  75  | 
  76  |   // Shell / session must be ready before navigating to gated routes
  77  |   await expect(
  78  |     page.getByRole('button', { name: /open notifications|open profile/i }).first(),
  79  |   ).toBeVisible({ timeout: 30_000 });
  80  | }
  81  | 
  82  | export async function loginAsHrOfficer(page: Page): Promise<void> {
  83  |   await loginAs(
  84  |     page,
  85  |     ATTENDANCE_USERS.hrOfficer.email,
  86  |     ATTENDANCE_USERS.hrOfficer.password,
  87  |     '/hr/attendance',
  88  |   );
  89  | }
  90  | 
  91  | export async function loginAsEmployee(page: Page): Promise<void> {
  92  |   await loginAs(
  93  |     page,
  94  |     ATTENDANCE_USERS.employee.email,
  95  |     ATTENDANCE_USERS.employee.password,
  96  |     '/profile',
  97  |   );
  98  | }
  99  | 
  100 | export async function loginAsSupervisor(page: Page): Promise<void> {
  101 |   await loginAs(
  102 |     page,
  103 |     ATTENDANCE_USERS.supervisor.email,
  104 |     ATTENDANCE_USERS.supervisor.password,
  105 |     '/approvals',
  106 |   );
  107 | }
  108 | 
  109 | export async function loginAsSamuel(page: Page): Promise<void> {
  110 |   await loginAs(
  111 |     page,
  112 |     ATTENDANCE_USERS.samuel.email,
  113 |     ATTENDANCE_USERS.samuel.password,
  114 |     '/profile',
  115 |   );
  116 | }
  117 | 
  118 | /**
  119 |  * Logs out by clearing storage and returning to login.
  120 |  */
  121 | export async function logout(page: Page): Promise<void> {
  122 |   await page.evaluate(() => {
  123 |     localStorage.clear();
  124 |     sessionStorage.clear();
  125 |   });
  126 |   await page.goto('/login');
  127 | }
  128 | 
```