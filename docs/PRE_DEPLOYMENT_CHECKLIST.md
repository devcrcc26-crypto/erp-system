# Pre-deployment checklist

Work through this before deploying to production. Each item says how to check it and what "done" looks like. Add new launch blockers here, not in chat or PR descriptions.

## Code health

- [ ] **TypeScript clean (backend).** `cd backend && npm run typecheck` reports **0 errors**.
  On 2026-10-06 there were **8** errors, all in files that predate the Announcements module:
  - `prisma/seed-payroll-test-data.ts` (`LeaveDayPortion`, possibly-null `startBound`)
  - project-management specs: `closure-chain`, `schedule-transitions` and `source-entity-links` (constructor arity drift)

  On 2026-10-15 `npm run typecheck` stops at a **syntax error** in `scripts/seed-contracts-from-august-2026.ts:836` (`;` instead of `,` after `employmentDateField`, committed in c671fbd2). While it is there tsc reports only that one error and **skips type-checking the whole backend**, so the count above can't be re-measured. Fix it first.
- [ ] **TypeScript clean (frontend).** `cd frontend && npm run typecheck` reports **0 errors**.
  On 2026-10-06 there were **55** errors, all pre-existing (the locale type error was fixed that day).
  Fix them or delete the dead code; don't silence them with `// @ts-ignore`.
- [ ] **Keep it clean.** Once both are at 0, run `npm run typecheck` in CI on every PR so the count can't grow back unseen.
- [ ] **Tests pass.** `backend: npm test` and `frontend: npm test`.
  On 2026-10-16 the `scan-only.util.spec.ts` failure is fixed (test updated to `UNPAID_LEAVE`; plain no-scan days stay `ABSENT`). `npm run typecheck` (backend) now checks the whole project including `scripts/`: 8 older errors remain (`seed-payroll-test-data` 2, `closure-chain` spec 3, `schedule-transitions` spec 1, `source-entity-links` spec 2). Under full-suite load the payroll Excel-export and payslip-zip specs and the frontend locale test can time out; they pass when run alone.
  Since 2026-10-15 backend Jest transpiles only (`isolatedModules`), so specs that used to fail at type-check now run and fail at runtime: **33 suites** (31 project-management, `company-setup-disciplines`, `scan-only`) have stale mocks/constructor arity. Fix the mocks; type errors are caught by `npm run typecheck`, not by Jest.
- [ ] **Lint passes.** `npm run lint` in both apps.

## Translations

- [ ] **English and Chinese locales match.** `cd frontend && npx vitest run lib/i18n/epc-locales.test.ts` passes.
  The test fails if `locales/en/epc.json` and `locales/zh/epc.json` have different keys, or if any literal `t('…')` key in the code is missing from either file. Chinese falls back to English text; a key missing from both shows the raw key.
- [ ] **Spot-check in Chinese.** Sign in as a user whose language is Chinese (Ms. Dong, the GM) and open Attendance, Work From Home, Payroll and Announcements.

## Data

- [ ] **PM cleanup.** Remove demo project-management data: `cd backend && npm run prisma:clear-pm` (deletes all projects and their PM/EPC records; keeps company, users, roles and permissions). Take a database backup first.
- [ ] **Remove test data from the test database.** Archive or delete test posts in Announcements (AN-0001 and AN-0002 were created during development and are visible only to the demo employee).
- [ ] **Migrations applied.** `cd backend && npx prisma migrate status` reports "Database schema is up to date".
- [ ] **Employment periods backfilled.** `$env:SEED_MODE='true'; npx ts-node --transpile-only scripts/backfill-employment-periods.ts` (dry run, then `--apply`). Dry run on 2026-10-15: 95 users → 95 periods to create, all from `employmentDate`. Then `scripts/fix-terminated-contract-end-dates.ts` (dry run 2026-10-15: 0 contracts to fix, 0 login-disabled users with open employment). Until the backfill runs, payroll and attendance fall back to "active login + employmentDate".
  The backfill is also required for phase 2: "contract ended, no new contract → still employed and paid on the ended contract" only applies to users who have an employment period. Users without one are still treated as leaving when their contract ends.
- [ ] **Prisma client regenerated after the separation migrations.** Stop the backend, then `cd backend && npx prisma generate` (on 2026-10-15 generation wrote the types but could not replace the query-engine DLL while the backend was running).
- [ ] **Backend restarted after employment phase 2.** Migration `20261015150000_employment_phase2` was applied on 2026-10-15 and the Prisma client regenerated, but the running backend predates it: restart it so the inactive / reactivate / rehire / reassign endpoints and the daily job (inactive status, contract-ended notices) are live.
- [ ] **Separation settlement policies reviewed.** HR Policy Settings → Separation: `unusedLeavePayout`, `severancePay` and `noticePay` are **disabled** by default (final settlement stays "handled outside the system"). Before enabling severance, set `parameters.monthsOfBasicPerYearOfService` (optional `maxMonths`, `minYearsOfService`, `taxable`); without it severance is 0 with a note on the entry.
- [ ] **Attendance recalculated after the 2026-10-16 policy defaults.** Code defaults changed: `earlyDepartureGraceMinutes` 30 → 15, `enrolmentGraceWorkingDays` → 5, `unpaidLeaveCountsRestDays` → false (days off/holidays inside unpaid leave stay paid). Installs with no saved policy version pick these up immediately; recalculate open months and re-generate any draft payroll runs.
- [ ] **Site-assignment overtime migrated and back-filled.** Migration `20261017100000_overtime_site_assignment` adds the site columns to `overtime_entry` (2026-10-17: applied to local `pwf_fresh` only; back-fill dry run there = 41 approved assignments, 0 entries to link, 48 skipped in 1 closed payroll period; not applied with `--apply`). Stop the backend, `npx prisma migrate deploy`, `npx prisma generate`, then `$env:SEED_MODE='true'; npx ts-node -r tsconfig-paths/register --transpile-only scripts/backfill-overtime-site-assignment.ts` (dry run, then `--apply`). The back-fill only sets the assignment link and `site_within_schedule_hours`; it never changes hours, and it skips entries in months with a closed payroll run (APPROVED / GM_APPROVED / PAID), reporting how many. Until it runs, existing entries on site days show no "Site assignment" label, and payroll prices them as office days (which matches their stored hours).
- [ ] **Expense claim item receipts migrated.** Migration `20261029120000_expense_claim_item_receipts` adds `expense_claim_item_receipt` (one item → many receipt files), copies every existing `expense_claim_item.document_id` into it, then drops that column. Stop the backend, take a backup, `npx prisma migrate deploy`, `npx prisma generate`, restart. Until it runs, the new backend code fails on expense claims (it reads `receipts`). Not yet applied anywhere as of 2026-10-29.
- [ ] **Site-day overtime policy reviewed.** `siteDayScheduledHoursClaimable` (HR Policy Settings → Overtime, System Administrator only) defaults to **off**: site and office days use the same rule — only time outside the work schedule is OT. Turn on only if scheduled office hours on APPROVED site-assignment days should also be claimable.
- [ ] **Request initiators migrated.** Migration `20261017140000_request_initiators` (approval `initiated_as`, tier `acting_approver_id` / `on_behalf_of_approver_id`, site-assignment `crew_id`) was created on 2026-10-17 and applied to local `pwf_fresh` only (Prisma client regenerated). The backend will not run against a database without it. Stop the backend, `npx prisma migrate deploy`, `npx prisma generate`, restart.
- [ ] **allowedInitiators reviewed.** HR Policy Settings → Requests (System Administrator only, takes effect immediately). Defaults: Site assignment = supervisor + delegate (no self), WFH = all three, Flight = self + delegate, Business trip = all three. GM / MD / HR Manager / HR Officer / System Administrator can always file for anyone and approve or return on behalf of any approver (never on their own requests or their own filings); reject stays with the assigned approver. Direct WFH assignment is now HR only.
- [ ] **Inactive policies reviewed.** `inactivePaid` (default: all unpaid) and `inactiveCanLogin` (default: only LONG_LEAVE can log in).
- [ ] **Permissions seeded.** `npm run prisma:seed-announcement-permissions`, plus any other module permission seeds added since the last deploy. In particular:
  - `npx ts-node --transpile-only prisma/seed-work-schedule-permissions.ts`: gives Employee (and leads, HR, GM/MD) `wfh.view` / `wfh.create`. Without it, Work From Home is missing from New Request and employees get 403 on submit. On 2026-10-29 the local dev DB had no `wfh` grants for Employee.
  - `npx ts-node --transpile-only prisma/scripts/grant-new-request-create-permissions.ts`: New Request `create` grants for all roles, and limits Vehicle Refueling to Driver / HR Officer / HR Manager / System Administrator. On 2026-10-29 the local dev DB still let Employee create refueling requests.

## Environment

- [ ] **File storage reachable from the backend process.** Upload an attachment in any module.
  On developer machines with Avast HTTPS scanning, start the backend with `NODE_EXTRA_CA_CERTS` pointing to Avast's certificate, or uploads fail with "unable to verify the first certificate".
- [ ] **Email settings.** `EMAIL_DISABLED=false` and `SEED_MODE=false` in production, with a working mail sender.
