# Payroll overtime - dated entries by contract period

**Date:** 2026-10-08  
**Scope:** OT priced from the contract in force on each overtime date (not month-end basic only).

## Overnight assignment

`OVERNIGHT_OT_DATE_ASSIGNMENT = START_DATE`

Overnight `OvertimeEntry` rows store **one** date (the start day) with **combined** hour buckets after classification spans midnight. Hours are **not** split into separate calendar-day entries in storage, so payroll assigns overnight OT to the salary period covering the **entry start date**.

If a future import writes one entry per calendar day, each part is assigned by its own `date`.

## Fallback

Sheets with category totals but **no** dated entries → all OT priced from the **month-end** contract basic, with entry note:

`Overtime rate from month-end contract (no dated entries)`

`PAYROLL_OT_BASIC_SOURCE` was removed; the fallback note is the only month-end signal.

## Tests

See `payroll-overtime.util.spec.ts`:

| Case | Result |
|---|---|
| 8 h Normal @ Aug 10 (basic 50k) | 3,125.00 |
| 8 h Normal @ Aug 28 (basic 70k) | 4,375.00 |
| Both | 7,500.00 |
| Holiday OT on old contract | old basic ÷ 196 |
| Single-contract | same as month-end basic × hours |
| Overnight spanning renewal | charged to start-date period |
| Totals only, no entries | month-end fallback |

## August 2026 payroll run

No August 2026 payroll run exists in the local DB at report time, so OT was not recalculated for the six salary-change employees. After creating a run (and optionally seeding dated OT via `scripts/seed-ot-entries-from-august-2026.ts`), regenerate to pick up per-period OT.

## Dual-row salary-sheet OT import

`scripts/seed-ot-entries-from-august-2026.ts` places old-row hours on a date inside the old contract’s August window and new-row hours inside the new window; dates are listed in `data/private/ot-entry-seed-report.md`.
