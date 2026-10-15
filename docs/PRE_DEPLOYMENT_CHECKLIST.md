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
  On 2026-10-15: `scan-only.util.spec.ts` "no scan + approved unpaid leave → ABSENT 1" fails because the `UNPAID_LEAVE` day status (commit 4438a06f) changed the expected status; update the test. Under full-suite load the payroll Excel-export and payslip-zip specs and the frontend locale test can time out; they pass when run alone.
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
- [ ] **Prisma client regenerated after the separation migrations.** Stop the backend, then `cd backend && npx prisma generate` (on 2026-10-15 generation wrote the types but could not replace the query-engine DLL while the backend was running).
- [ ] **Permissions seeded.** `npm run prisma:seed-announcement-permissions`, plus any other module permission seeds added since the last deploy.

## Environment

- [ ] **File storage reachable from the backend process.** Upload an attachment in any module.
  On developer machines with Avast HTTPS scanning, start the backend with `NODE_EXTRA_CA_CERTS` pointing to Avast's certificate, or uploads fail with "unable to verify the first certificate".
- [ ] **Email settings.** `EMAIL_DISABLED=false` and `SEED_MODE=false` in production, with a working mail sender.
