# Attendance import audit - CCECC PWF

**Date:** 8 October 2026  
**Scope:** Read-only. No code, data, or migrations were changed for this audit (aside from writing this document). Servers were not started or restarted.

---

## 1. Recent changes

### Committed (last ~15 on attendance / schema paths)

| Commit | Summary | Complete? |
|--------|---------|-----------|
| `dd5656ab` *feat(attendance): add missing employee tracking…* | Preview returns `missingFromAttendance` (active ERP users with no matched/review row in the file). Import modal shows a **Not in Attendance File** section. | **Partial** - list only; no presence actions in that commit. |
| `ed802bf1` *feat(auto-approve)…* (also touched attendance) | Fuzzy name match now includes **middle name** (`first + middle + last`). Import modal rowKey / styling cleanup. | Middle-name matching: **yes**. (Auto-approve body is unrelated.) |
| `daa11c20` *feat(employee): add FREELANCER…* | Adds `EmployeeType.FREELANCER` to schema / user model. | Schema/type: **yes**. Attendance behaviour for freelancers was not in this commit. |
| Older (`5e40122e` … `8d517e39`) | Overtime attendance warnings, WFH/site modules, attendance UI v2 - foundational, not this week’s Case A/B work. | N/A for this audit. |

`schema.prisma` itself was not changed in the latest attendance-specific commits for Case A/B (no new attendance-exempt or device-mapping columns).

### Uncommitted (working tree)

| Path | What it does | Complete? |
|------|----------------|-----------|
| `attendance.service.ts` + `attendance.dto.ts` | On confirm: optional `missingEmployeeActions` (`SITE` / `WFH`) create approved site assignments or WFH days for the import month; freelancers missing from the file get synthetic attendance records; attendance recalc uses `employeeType`. | **Mostly** - wired end-to-end in service/DTO; needs a running backend with this code to take effect on the next import. |
| `day-deduction.util.ts` (+ context + spec) | Freelancers with no clock punches get `PRESENT` / 0 deduction (`isFreelancerEmployee`). WFH context also treats `employeeIds` on any scope as a match. | **Yes** for deduction rules (unit-tested). |
| `AttendanceImportModal.tsx` + locales + `attendance.types.ts` | UI to set Skip / On site / Work from home on missing employees; freelancers tagged “full presence”; sends `missingEmployeeActions` on confirm. | **Yes** for UI/types (depends on backend uncommitted changes). |

**Not found in recent changes:** persistent device-ID ↔ user mapping, “ignore this Deli person forever”, or an `attendanceExempt`-style flag on User.

---

## 2. Import flow, step by step

### File format (`attendance-excel.parser.ts`)

- **Sheet:** first worksheet; name must match `月度汇总表_YYYYMMDD_YYYYMMDD` (period taken from that name).
- **Headers:** row 2 holds daily date headers; **daily columns start at column 18** (A–Q are identity/aggregates).
- **Person rows:** from row 3, in **pairs** - clock-in row then clock-out row.
- **Identifiers per person:**
  - **Column A:** attendance name (`attendanceName`)
  - **Column B:** attendance / machine ID string (`attendanceId`; blank → `'-'`)
  - **Column H:** machine payable hours (preview/debug only; persisted hours come from recalculation)
- Clock cells are machine (CST) times, converted to Ethiopia-local for storage.

### Matching (`attendance-matching.service.ts`)

Order:

1. **Exact `employeeId`** - if `attendanceId` is set and not `'-'`, match `User.employeeId === attendanceId` among **active, non-deleted** company users → `ID_MATCH` (score 100).
2. Else **fuzzy full name** (fuse.js on `firstName + middleName + lastName`, threshold 0.35):
   - score ≥ 90 → `NAME_HIGH`
   - score ≥ 70 → `NAME_REVIEW`
   - else → `NO_MATCH`

**No persistent mapping** (no device/biometric ID table). Matching uses live ERP `employeeId` and name only; nothing is stored between imports for “this Deli ID = this user”.

Buckets after match: `matched` = ID_MATCH + NAME_HIGH; `review` = NAME_REVIEW; `rejected` = NO_MATCH.

### Preview (10-minute cache - Redis or in-memory)

HR sees:

- **Matched** - auto-accepted high confidence  
- **Needs Review** - include checkbox; optional reassign to another ERP user  
- **Not Matched** - file rows with no ERP match; optional **Assign Employee**  
- **Not in Attendance File** *(recent)* - active ERP users not linked from matched/review; optional site/WFH (uncommitted UI); freelancers marked full presence  

Also: already-imported warning for that month/year; confirm can overwrite.

### Commit (`confirmImport`)

Writes:

1. Optional overwrite: delete prior batch for company+month+year (and dependent daily logs / field-movement links / monthly approval).
2. **`AttendanceImportBatch`** - `totalRows`, `matchedRows` (= count of records written), `reviewRows` (= confirmed review indices), `rejectedRows` (= still-unmatched file rows).
3. **`AttendanceRecord`** per imported employee (unique company+employee+month+year) + **`AttendanceDailyLog`** rows from clock data (empty daily data for synthetic freelancers/site/WFH rows, then filled by recalculate).
4. **`AttendanceMonthlyApproval`** (PENDING_REVIEW).
5. `recalculateCompanyAttendanceMonth` (day status / paid days / site / WFH / leave / freelancers).

Match confidence (`ID_MATCH` / `MANUAL` / etc.) is **not persisted** on the record - only used during preview/confirm. “MANUAL” is an in-memory confidence for HR-assigned review/rejected/synthetic rows, not a DB enum on `AttendanceRecord`.

Unmatched file rows left unassigned are **not stored**; names are returned once in the confirm response as `rejectedNames`.

### Overwrite

If a batch already exists for that month/year and `overwrite=false` → `ConflictException`. If `overwrite=true` → wipe prior batch/records for that period, then import again. Site/WFH created by a prior import’s missing-employee actions are **not** automatically rolled back by overwrite.

---

## 3. Case A - in the file, not in the ERP

| Question | Today |
|----------|--------|
| What happens? | Row lands in **Not Matched** (`NO_MATCH`). Import does not fail. If HR leaves it unassigned, it is **skipped** on confirm; counted in `rejectedRows`; names appear in the done-step `rejectedNames` list only for that session. |
| Persist “left company - ignore forever”? | **No.** Same Deli enrolment reappears every month until removed from the export or matched. |
| Map to an existing user in preview? | **Yes** - assign an ERP employee on the Not Matched table (`manualAssignments` bucket `rejected`). That writes a normal attendance record (confidence MANUAL in-memory). |

Inactive/deleted ERP users are not candidates for auto-match (matcher only loads `isActive: true`, `deletedAt: null`).

---

## 4. Case B - active in the ERP, not in the file

| Question | Today |
|----------|--------|
| Does import create anything? | **Committed behaviour:** nothing for them. **Uncommitted:** freelancers get a synthetic record (full presence via dayDeduction); optional SITE/WFH creates assignment/WFH + synthetic record. Others still get nothing unless HR acts. |
| Review page? | `AttendanceReviewPageContent` / `AttendanceTable` list **`AttendanceRecord`s for that month only**. People with no record do **not** appear. |
| Payroll? | For `includeInPayroll` + active + overlapping contract and **no** attendance record for the month: flag **`MISSING_ATTENDANCE`** (`flagNote`: “No attendance record found for this month”). **`payrollDays` stays at full employed calendar days** for the month (`totalEmployedDays`); pay is not zeroed solely for missing attendance. |
| Attendance-exempt field? | **No** field named `attendanceExempt` / `requiresAttendance` / `trackAttendance` / `includeInAttendance`. Closest related: `includeInPayroll` (payroll roster only), `employeeType` FREELANCER (uncommitted full presence in dayDeduction), site assignment / WFH (legitimate non-scan coverage when records exist). |
| List “active employees missing from this month’s file”? | **Yes on preview** (`missingFromAttendance`). **Not** retained after confirm; **not** on the review page. |

---

## 5. Walkthrough - latest real import

Queried `AttendanceImportBatch` ordered by `importedAt` desc (read-only).

| Field | Value |
|-------|--------|
| File | `August Attendance (2).xlsx` |
| Period | **August 2026** |
| Imported at | 2026-10-08T06:26:51.673Z |
| Batch id | `7400ec54-5038-45ca-b192-ee5cc67d19a6` |
| `totalRows` (file people) | **74** |
| `matchedRows` (records written) | **67** |
| `reviewRows` (confirmed review indices) | **9** |
| `rejectedRows` (unassigned NO_MATCH) | **7** |
| Records in DB | **67** |

**Match method breakdown:** not recoverable after confirm (no per-row confidence stored). Aggregates imply: of 74 file rows, 67 were imported (auto + confirmed review + any manual assigns), **7 unmatched names were discarded** - those names are **not** in the database.

**Active `includeInPayroll` users with no August 2026 attendance record** (28 people). For each, payroll generation would set **`MISSING_ATTENDANCE`** and use **full employed days** as `payrollDays`:

| Name | ERP ID | Type |
|------|--------|------|
| Ababo Gereme | CC-0001 | CONTRACT |
| Abireham Yishak | CC-0004 | CONTRACT |
| Abiyu Bekele | CC-0005 | CONTRACT |
| Aderaw Sitotaw | CC-0094 | CONTRACT |
| Agegahegn Tefera | CC-0007 | CONTRACT |
| Agegnehu Gelaw | CC-0008 | CONTRACT |
| Asaminew Kebede | CC-0092 | CONTRACT |
| Beru Yargale | CC-0011 | CONTRACT |
| Biniam G/silasise | FR-0001 | FREELANCER |
| Dinberu Alemu | CC-0017 | CONTRACT |
| Efeson Bassa | CC-0019 | CONTRACT |
| Habtamu Gizaw | CC-0024 | CONTRACT |
| Habtu Mulat | CC-0093 | CONTRACT |
| Hailemicheal Mulugeta | CC-0026 | CONTRACT |
| Haymanot Yigrem | CC-0028 | CONTRACT |
| Henok Tesfaye | CC-0089 | CONTRACT |
| Israel Woldetsadik | CC-0032 | CONTRACT |
| Mesfin Abi Mamuye | CC-0041 | CONTRACT |
| Muse Asefa | CC-0047 | CONTRACT |
| Nahom Asfaw | CC-0050 | CONTRACT |
| Seid Hussen | CC-0060 | CONTRACT |
| Shimeles Ayele | CC-0063 | CONTRACT |
| Terefe Dabele | CC-0071 | CONTRACT |
| Tesfu Berhane | CC-0074 | CONTRACT |
| Tewodros Desye | CC-0076 | CONTRACT |
| Yonas Bizualem | CC-0083 | CONTRACT |
| Zelalem Sefiw | CC-0084 | CONTRACT |
| Zeru Tasew | CC-0086 | CONTRACT |

Note: this August batch was imported **before** the uncommitted freelancer / site / WFH-on-import behaviour; re-import with that code would change freelancers and any HR-tagged site/WFH missing employees.

---

## 6. Gaps (Case A / Case B)

1. **No persistent Deli/device ID ↔ user mapping** - rematch every month; ID must equal `User.employeeId`.
2. **No “ignore this attendance identity” / leavers suppress list** - Case A people reappear every import.
3. **Unmatched file rows are discarded** - only a count (`rejectedRows`) and a one-shot `rejectedNames` on confirm; no audit table of who was skipped.
4. **Match method not stored on records** - cannot report ID vs name vs manual after the fact.
5. **No attendance-exempt / “doesn’t use scanner” flag** - cannot distinguish “should enrol on machine” vs “legitimately never scans” in import, review, or payroll.
6. **Review page only shows people with records** - Case B absences are invisible there.
7. **Missing-from-file list is preview-only** - not persisted against the batch for later HR follow-up.
8. **Payroll `MISSING_ATTENDANCE` still pays full employed days** - flag exists, but there is no forced withhold or separate exempt path.
9. **Site/WFH-on-import and freelancer full presence are incomplete relative to committed trunk** - present in working tree; August batch already imported without them.
10. **Overwrite does not reverse prior import-created site/WFH rows** - possible leftover presence coverage if HR re-imports.

---

## Key code references

- Parser: `backend/src/modules/attendance/utils/attendance-excel.parser.ts`
- Matching: `backend/src/modules/attendance/application/services/attendance-matching.service.ts`
- Preview/confirm: `backend/src/modules/attendance/application/services/attendance.service.ts`
- Preview cache: `backend/src/modules/attendance/application/services/attendance-preview.cache.ts`
- Day deduction: `backend/src/modules/attendance/application/utils/day-deduction.util.ts`
- Payroll missing attendance: `backend/src/modules/payroll/application/services/payroll-run.service.ts` (~1022–1072)
- UI: `frontend/components/modules/hr/attendance/AttendanceImportModal.tsx`, `AttendanceReviewPageContent.tsx`, `AttendanceTable.tsx`
