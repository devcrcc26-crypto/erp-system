# Pre-deployment checklist

Work through this before deploying to production. Each item says how to check it and what "done" looks like. Add new launch blockers here, not in chat or PR descriptions.

## Code health

- [ ] **TypeScript clean (backend).** `cd backend && npm run typecheck` reports **0 errors**.
  On 2026-10-06 there were **8** errors, all in files that predate the Announcements module:
  - `prisma/seed-payroll-test-data.ts` (`LeaveDayPortion`, possibly-null `startBound`)
  - project-management specs: `closure-chain`, `schedule-transitions` and `source-entity-links` (constructor arity drift)
- [ ] **TypeScript clean (frontend).** `cd frontend && npm run typecheck` reports **0 errors**.
  On 2026-10-06 there were **55** errors, all pre-existing (the locale type error was fixed that day).
  Fix them or delete the dead code; don't silence them with `// @ts-ignore`.
- [ ] **Keep it clean.** Once both are at 0, run `npm run typecheck` in CI on every PR so the count can't grow back unseen.
- [ ] **Tests pass.** `backend: npm test` and `frontend: npm test`.
- [ ] **Lint passes.** `npm run lint` in both apps.

## Translations

- [ ] **English and Chinese locales match.** `cd frontend && npx vitest run lib/i18n/epc-locales.test.ts` passes.
  The test fails if `locales/en/epc.json` and `locales/zh/epc.json` have different keys, or if any literal `t('…')` key in the code is missing from either file. Chinese falls back to English text; a key missing from both shows the raw key.
- [ ] **Spot-check in Chinese.** Sign in as a user whose language is Chinese (Ms. Dong, the GM) and open Attendance, Work From Home, Payroll and Announcements.

## Data

- [ ] **PM cleanup.** Remove demo project-management data: `cd backend && npm run prisma:clear-pm` (deletes all projects and their PM/EPC records; keeps company, users, roles and permissions). Take a database backup first.
- [ ] **Remove test data from the test database.** Archive or delete test posts in Announcements (AN-0001 and AN-0002 were created during development and are visible only to the demo employee).
- [ ] **Migrations applied.** `cd backend && npx prisma migrate status` reports "Database schema is up to date".
- [ ] **Permissions seeded.** `npm run prisma:seed-announcement-permissions`, plus any other module permission seeds added since the last deploy.

## Environment

- [ ] **File storage reachable from the backend process.** Upload an attachment in any module.
  On developer machines with Avast HTTPS scanning, start the backend with `NODE_EXTRA_CA_CERTS` pointing to Avast's certificate, or uploads fail with "unable to verify the first certificate".
- [ ] **Email settings.** `EMAIL_DISABLED=false` and `SEED_MODE=false` in production, with a working mail sender.
