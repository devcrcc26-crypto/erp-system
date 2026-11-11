# Overtime module audit - CCECC PWF

**Date:** 2026-10-07  
**Scope:** Classification (`overtime-hours.util.ts`), entry path (`overtime-entry.service.ts`, `overtime.service.ts`), Excel import, frontend drawer/preview, payroll handoff.  
**Method:** Read-only code review + local evaluation of `calculateOvertimeHours` against CRCC Standard schedule context (Mon–Fri 08:30–12:30 / 13:30–17:30; Sat half-day 08:30–12:30; Sun off). No production data mutated. Backend/frontend were not started or restarted.

**Company schedule reference (seed):** `CRCC Standard` - weekdays morning `08:30–12:30`, afternoon `13:30–17:30`; Saturday half-day `08:30–12:30`; Sunday non-working.

---

## Executive summary

Two suspected bugs are **confirmed**:

1. **Working hours count as overtime.** On a full working day the splitter never consults morning/afternoon windows. Every non-night block becomes Regular OT. Mon `09:00–17:00` → **8 h Regular** (expected 0 / not OT).
2. **Overnight uses only the start day's context.** Minutes after midnight keep the start day's holiday/working/half-day flags. Sat `20:00` → Sun `02:00` → all **6 h Weekend** under Saturday half-day rules (expected 4 Weekend Sat + 2 Weekend Sun - same category here, but Fri→Sat and weekday→holiday overnight cases are wrong).

Additional findings that Phase 2 must address:

- Half-day **inside** the morning window currently counts as Regular OT (Sat `09:00–12:00` → 3 h Regular; expected 0).
- Full-day schedule windows (`afternoonStart` / `afternoonEnd`) are **not** passed into `OvertimeDayContext` at all.
- No leave, attendance, or payroll-lock checks on add/edit/delete.
- Daily/monthly hour **limits are not enforced** (none in overtime module).
- Drawer preview **already** calls the server preview endpoint (same `classifyEntry` path). Keep that; do not reintroduce a client-side copy.
- Excel import already goes through `OvertimeService.addEntry` → same classification (and thus same bugs).

---

## A. Classification matrix

Assumptions unless noted: CRCC Standard weekday / half-day / off-day / holiday contexts as used by current code. Overnight cases evaluated with **start-day context only** (today's behaviour).

| # | Case | Expected | Actual (today) | Match? |
|---|---|---|---|---|
| 1 | Mon 18:00–21:00 | 3 h Regular | 3 h Regular | Yes |
| 2 | Mon 18:00–23:00 | 4 h Regular + 1 h Night | 4 h Regular + 1 h Night | Yes |
| 3 | Mon 22:00–02:00 (overnight) | 4 h Night | 4 h Night | Yes |
| 4 | **Mon 09:00–17:00** | **0 h** (reject / not counted) | **8 h Regular** | **No** |
| 5 | Mon 17:00–19:00 | 1.5 h Regular (17:30–19:00) | **2 h Regular** (includes 17:00–17:30) | **No** |
| 6 | Mon 12:30–13:30 (lunch) | Report behaviour | **1 h Regular**; lunch is **not** in scheduled windows (gap between morningEnd and afternoonStart). Under company rules this *is* outside scheduled hours → Regular OT is the correct category once schedule exclusion exists. Matrix row 4's "0 h" for 09:00–17:00 conflicts with Phase 2 rule 1 for the lunch slice (would be **1 h Regular** after a correct fix). | Partial |
| 7 | Sat 09:00–12:00 | 0 h (inside half day) | **3 h Regular** | **No** |
| 8 | Sat 13:00–17:00 | 4 h Weekend | 4 h Weekend | Yes |
| 9 | Sun 08:00–12:00 | 4 h Weekend | 4 h Weekend | Yes |
| 10 | **Sat 20:00 – Sun 02:00** | 4 h Weekend (Sat) + 2 h Weekend (Sun) | **6 h Weekend** (Sat half-day overflow for whole span; Sun never consulted) | Categories sum match; **day-split missing** |
| 11 | **Fri 20:00 – Sat 02:00** | 2 Regular + 2 Night (Fri) + 2 Night (Sat early) | **2 Regular + 4 Night** (Fri context for all; Sat midnight not reclassified) | **No** |
| 12 | Sep 11 (Enkutatash) 09:00–13:00 | 4 h Holiday | 4 h Holiday (when `isHoliday` true via calendar / override) | Yes* |
| 13 | **Sep 10 20:00 – Sep 11 02:00** | 2 Regular + 2 Night (Sep 10) + 2 Holiday (Sep 11) | **2 Regular + 4 Night** (Sep 10 context only) | **No** |
| 14 | Aug 14 (WFH) 18:00–20:00 | 2 h Regular | 2 h Regular - OT uses `getActiveSchedule` weekday rules; WFH calendar is **not** treated as off. Matches "WFH = working day". | Yes |
| 15 | Non-standard schedule | Uses **their** schedule | `OvertimeEntryService.classifyEntry` → `workScheduleService.getActiveSchedule(employeeId, …, onDate)` (assignment else company default). Site assignment does not swap the schedule. | Yes (for schedule identity); **but** full-day windows still unused for exclusion |
| 16 | Weekday 18:07–19:52 | Report rounding | **1.75 h Regular**. Blocks are **15 minutes** from the raw start minute (not snapped to `:00/:15/:30/:45`). Span happens to be exactly 7×15. Odd starts are allowed. | Reported |

\*Holiday detection depends on `WorkScheduleService.isHolidayForEmployee` (nationality + PublicHoliday). Import may also force holiday via `holidayOverride` + row flag.

### Root cause (classification)

```76:98:backend/src/modules/overtime/application/utils/overtime-hours.util.ts
  for (let m = startMinutes; m < endMinutes; m += BLOCK_MINUTES) {
    ...
    if (context.isHoliday) {
      holidayHours += blockHours;
    } else if (!context.isWorkingDay || isHalfDayOverflow) {
      weekendHours += blockHours;
    } else if (isNightBlock) {
      nightHours += blockHours;
    } else {
      regularHours += blockHours;  // ← includes scheduled working hours
    }
  }
```

- No "inside scheduled morning/afternoon → skip / zero" branch.
- Half-day overflow only marks **outside** morning as Weekend; **inside** morning falls through to Regular.
- Single `context` for the whole interval; overnight loop wraps `minutesInDay` but never advances calendar day / reloads context.

`OvertimeDayContext` only carries `morningStart` / `morningEnd` - not `afternoonStart` / `afternoonEnd`.

---

## B. Entry process

| Topic | Behaviour today |
|---|---|
| Overlapping entries same day | **Rejected** - `assertNoOverlap` → `ConflictException` with existing interval. Overnight end extended by +24h for comparison. |
| Exact duplicate | **Rejected** - unique `(sheetId, date, startTime, endTime)` → `P2002` → "An entry with the same date and start/end times already exists". |
| Approved full-day leave | **Not checked.** Entry allowed. |
| Half-day leave | **Not checked.** |
| No attendance scans (absent) | **Not checked / not warned.** |
| Claim after clock-out (e.g. out 17:30, claim to 19:00) | **Not checked / not warned.** Approver sees no attendance flag. |
| Future dates | **Rejected** - `assertEntryInSheetMonth` + `isDateInFuture`. Drawer also disables future days. |
| Outside sheet month | **Rejected** - must match sheet `month`/`year`. |
| Edit/delete after submit | **Blocked** - only `DRAFT` / `RETURNED` (`requireEditableSheet`). |
| Edit/delete after approval | **Blocked** (sheet not editable). |
| Edit/delete after payroll GM_APPROVED / PAID | **Not locked specifically.** If sheet is still DRAFT/RETURNED somehow, edits still allowed. No query of `PayrollRun` status. |
| Open past month (regular vs on-behalf) | **Allowed** for both. Future months blocked. On-behalf via `OnBehalfService.resolveTargetEmployeeId`. Cancelled sheets reopen as DRAFT. |
| Drawer preview vs server save | **Same path.** Drawer debounces `usePreviewOvertimeEntry` → `POST` preview → `OvertimeEntryService.previewEntry` → `classifyEntry`. Save uses `classifyEntry` again. Preview and save should match for the same inputs (including shared bugs). |
| Excel import | `OvertimeImportService` → `overtimeService.addEntry(..., { allowHolidayOverride })`. Overnight inferred when `endTime <= startTime`. Same overlap + classification path. |
| Daily / monthly hour limits | **None enforced** in overtime module (no caps in util/service/DTO). Report only - await HR. |

Editable sheet statuses: `DRAFT`, `RETURNED` only.

---

## C. Payroll handoff

### Which sheets are included

`payroll-run.service` loads overtime sheets with:

- same `companyId`, `employeeId` set, `month`, `year`
- **`status: 'APPROVED'` only**

Pending / submitted / draft sheets are **ignored** (no flag on the payroll entry for "OT pending").

### Category mapping

| Sheet field | Payroll field | Rate | Base |
|---|---|---|---|
| `totalRegularHours` | `normalHours` / `normalOtHours` | × 1.5 | `earnedSalary / 192` |
| `totalNightHours` | `eveningHours` / `eveningOtHours` | × 1.75 | `earnedSalary / 192` |
| `totalWeekendHours` | `sundayHours` / `sundayOtHours` | × 2.0 | `earnedSalary / 192` |
| `totalHolidayHours` | `holidayHours` / `holidayOtHours` | × 2.5 | `earnedSalary / 196` |

**Hourly base unchanged (as requested):** still ÷ 192 (and ÷ 196 for holiday). Pending HR decision.

### Approve OT after payroll generated

- `recalculate` allowed only when run status is **`DRAFT` or `REVIEWED`**.
- Recalculate re-reads currently **APPROVED** OT sheets for that month.
- If a sheet is approved **after** generate/recalculate while the run is still DRAFT/REVIEWED → **picked up on next recalculate**.
- If the run is already **APPROVED / GM_APPROVED / PAID** → recalculate refused; late OT approval is **not** pulled in automatically.
- Pending OT at run time → employee simply gets **0** OT hours; nothing flags "sheet awaiting approval".

### Worked example (current rates/base - unchanged by classification bugs)

Employee: earned salary **15,000**; hours **4 Regular, 2 Night, 6 Weekend, 3 Holiday**.

| Bucket | Hours | Base | Multiplier | Amount (ETB) |
|---|---:|---:|---:|---:|
| Regular | 4 | 15 000 / 192 = 78.125 | × 1.5 | **468.75** |
| Night | 2 | 78.125 | × 1.75 | **273.44** |
| Weekend | 6 | 78.125 | × 2.0 | **937.50** |
| Holiday | 3 | 15 000 / 196 ≈ 76.5306 | × 2.5 | **573.98** |
| **Total OT pay** | | | | **2 253.67** |

Amounts use payroll `round` = `Math.round(x * 100) / 100`.

Classification bugs change **which hours land in which bucket / sheet totals**, not these rate formulae. After Phase 2 fixes, the same claimed clock times will produce different sheet totals → different payroll amounts; the example above remains the correct pay math for those four hour counts.

---

## Frontend notes

- `OvertimeEntryFormDrawer` - server preview, month/future guards, overnight checkbox required when end ≤ start.
- `OvertimeNewPageContent` - month picker (no future), on-behalf optional; opens/creates sheet then navigates to detail.
- `OvertimeSheetDetailPageContent` - entry CRUD when DRAFT/RETURNED; sheet-scoped Excel import.

---

## Confirmed defects for Phase 2

1. Exclude scheduled working windows (morning **and** afternoon) from OT; reject entry if resulting OT hours are zero with message *"These hours are within your normal working hours."*
2. Classify overnight **per calendar day** with each day's holiday / working / half-day / schedule context.
3. Keep overlap + exact-duplicate rejection (already present).
4. Reject full-day approved leave; half-day leave → only hours outside leave half **and** schedule count.
5. Attendance mismatch / no scans → **warning + approver flag**, not block.
6. Lock entry mutations when month's payroll run is `GM_APPROVED` or `PAID`.
7. Keep server preview endpoint as sole classification source for the drawer.
8. Import continues on same path (inherits fixes).
9. Do **not** add daily/monthly limits until HR confirms.

### Matrix vs Phase 2 nuance (case 4 / 6)

After schedule exclusion:

- Mon `09:00–17:00` → **1 h Regular** (12:30–13:30 lunch), not 0, unless product chooses to reject "mostly-scheduled" spans separately.
- Mon `12:30–13:30` alone → **1 h Regular** (correct under company "outside scheduled hours").

Phase 2 implements rule 1 literally (exclude windows; reject only when **no** OT remains). Matrix row 4's "0 h" is over-simplified relative to lunch.

---

## Phase 2 - Fixes applied (2026-10-07)

| Item | Fix |
|---|---|
| A1–A3, A8–A9, A12, A14 | Already correct; covered by regression tests |
| A4 Mon 09–17 | Schedule exclusion → **1 h Regular** (lunch); full in-schedule span rejected with `WITHIN_SCHEDULE_MESSAGE` |
| A5 Mon 17–19 | Counts **1.5 h Regular** from 17:30 |
| A6 Lunch | **1 h Regular** (outside schedule) |
| A7 Sat morning | **0 h** (inside half-day morning) |
| A10 overnight Sat→Sun | Per-day context → Weekend on both days |
| A11 overnight Fri→Sat | 2 Regular + 2 Night (Fri) + 2 Night (Sat pre-morning) |
| A13 overnight into holiday | Next-day holiday context applied |
| A15 | Still uses `getActiveSchedule` for the employee |
| A16 | 15-minute blocks from raw start; 18:07–19:52 → 1.75 h |
| B Overlap / duplicate | Unchanged (already rejected) |
| B Full-day leave | Rejected (`FULL_DAY_LEAVE_MESSAGE`) |
| B Half-day leave | Excluded windows merged into classification |
| B Attendance | Warning on entry + preview (`attendance_warning`); not blocking |
| B Payroll lock | `GM_APPROVED` / `PAID` blocks entry mutations |
| B Preview / import | Same `classifyEntry` path |
| B Limits | Still none (await HR) |

Payroll rates/base **unchanged** (÷192 / ÷196). Worked example amounts in section C remain valid for those hour counts.

---

## Files reviewed

- `backend/src/modules/overtime/application/utils/overtime-hours.util.ts` (+ existing `.spec.ts`)
- `backend/src/modules/overtime/application/services/overtime-entry.service.ts`
- `backend/src/modules/overtime/application/services/overtime.service.ts`
- `backend/src/modules/overtime/application/services/overtime-import.service.ts`
- `backend/src/modules/work-schedule/application/services/work-schedule.service.ts` (`getActiveSchedule`)
- `backend/src/modules/payroll/application/services/payroll-run.service.ts`
- `backend/src/modules/payroll/application/services/payroll-calculation.service.ts`
- `frontend/components/modules/hr/overtime/OvertimeEntryFormDrawer.tsx`
- `frontend/components/modules/hr/overtime/OvertimeNewPageContent.tsx`
- `frontend/components/modules/hr/overtime/OvertimeSheetDetailPageContent.tsx` (entry/import surface)
- `backend/prisma/seed/work-schedules.seed.ts` (CRCC Standard hours)
