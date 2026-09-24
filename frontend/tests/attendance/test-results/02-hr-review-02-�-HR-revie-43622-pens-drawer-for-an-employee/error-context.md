# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-hr-review.spec.ts >> 02 �?HR review page >> View Daily Logs button opens drawer for an employee
- Location: tests\attendance\02-hr-review.spec.ts:59:7

# Error details

```
Test timeout of 45000ms exceeded while running "beforeEach" hook.
```

```
Error: page.waitForURL: Test timeout of 45000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - generic [ref=f2e5]:
    - banner [ref=f2e6]:
      - generic [ref=f2e7]:
        - img "CCECC" [ref=f2e9]
        - generic [ref=f2e10]:
          - generic [ref=f2e11]: CCECC
          - generic [ref=f2e12]: Construction ERP
    - main [ref=f2e13]:
      - generic [ref=f2e14]:
        - generic [ref=f2e16]:
          - heading "Sign in" [level=1] [ref=f2e17]
          - paragraph [ref=f2e18]: Enter your email and password to continue
          - generic [ref=f2e19]:
            - generic [ref=f2e21]:
              - generic "Email" [ref=f2e23]
              - textbox "Email" [ref=f2e27]:
                - /placeholder: name@company.com
            - generic [ref=f2e29]:
              - generic "Password" [ref=f2e31]
              - generic [ref=f2e35]:
                - textbox "Password" [ref=f2e36]
                - button "Show" [ref=f2e38] [cursor=pointer]:
                  - img "eye-invisible" [ref=f2e39]
            - button "Sign in" [ref=f2e48] [cursor=pointer]
          - paragraph [ref=f2e50]:
            - link "Forgot password?" [ref=f2e51] [cursor=pointer]:
              - /url: /forgot-password
        - complementary "Demo access" [ref=f2e52]:
          - generic [ref=f2e53]:
            - generic [ref=f2e54]:
              - paragraph [ref=f2e55]: Demo access
              - paragraph [ref=f2e56]: Click an account to fill email and password
            - generic [ref=f2e57]:
              - button "Employee Eyuel Tilahun eyuel.tilahun@company.local" [ref=f2e58]:
                - generic [ref=f2e59]: Employee
                - generic [ref=f2e60]: Eyuel Tilahun
                - generic [ref=f2e61]: eyuel.tilahun@company.local
              - button "Discipline Leader Xiaoming Li xiaoming.li@company.local" [ref=f2e62]:
                - generic [ref=f2e63]: Discipline Leader
                - generic [ref=f2e64]: Xiaoming Li
                - generic [ref=f2e65]: xiaoming.li@company.local
              - button "HR Manager Jinxia Dong jinxia.dong@company.local" [ref=f2e66]:
                - generic [ref=f2e67]: HR Manager
                - generic [ref=f2e68]: Jinxia Dong
                - generic [ref=f2e69]: jinxia.dong@company.local
    - contentinfo [ref=f2e70]: © 2026 CCECC · Construction ERP
  - button "Open Next.js Dev Tools" [ref=f2e76] [cursor=pointer]
  - alert [ref=f2e80]
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
  66  |     throw new Error(
  67  |       `Login failed for ${email}: HTTP ${response.status()}`,
  68  |     );
  69  |   }
  70  | 
> 71  |   await page.waitForURL(
      |              ^ Error: page.waitForURL: Test timeout of 45000ms exceeded.
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