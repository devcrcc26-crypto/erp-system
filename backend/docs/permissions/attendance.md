# Attendance Module — Permissions Deep-Dive

_Read-only audit. No code was changed._

---

## Controllers & Handlers

### `AttendanceController` — `@Controller('hr/attendance')`

Class guards: `@UseGuards(PermissionsGuard)` (no class-level `@RequireAnyPermission` — every handler carries its own).
[attendance.controller.ts:55](../../../src/modules/attendance/presentation/attendance.controller.ts#L55)

| Handler | Method | Path | Current Guard |
|---|---|---|---|
| `previewImport` | POST | `hr/attendance/import/preview` | `@RequireAnyPermission(hr.view)` |
| `confirmImport` | POST | `hr/attendance/import/confirm` | `@RequireAnyPermission(hr.view)` |
| `importHistory` | GET | `hr/attendance/import/history` | `@RequireAnyPermission(hr.view)` |
| `searchEmployees` | GET | `hr/attendance/employees/search` | `@RequireAnyPermission(hr.view)` |
| `listAwaitingEnrolment` | GET | `hr/attendance/awaiting-enrolment` | `@RequireAnyPermission(hr.view)` |
| `listIdentities` | GET | `hr/attendance/identities` | `@RequireAnyPermission(hr.view)` |
| `updateIdentity` | PATCH | `hr/attendance/identities/:id` | `@RequireAnyPermission(hr.view)` |
| `getImportBatchDetails` | GET | `hr/attendance/imports/:batchId/details` | `@RequireAnyPermission(hr.view)` |
| `resolveImportMissing` | POST | `hr/attendance/imports/:batchId/missing/:missingId/resolve` | `@RequireAnyPermission(hr.view)` |
| `listMonthlyApprovals` | GET | `hr/attendance/monthly-approvals` | `@RequireAnyPermission(hr.view)` |
| `getMonthlyApproval` | GET | `hr/attendance/monthly-approvals/:month/:year` | `@RequireAnyPermission(hr.view)` |
| `markAsReviewed` | POST | `hr/attendance/monthly-approvals/:id/review` | `@RequireAnyPermission(hr.view)` |
| `approveMonth` | POST | `hr/attendance/monthly-approvals/:id/approve` | `@RequireAnyPermission(hr.view)` |
| `unlockMonth` | POST | `hr/attendance/monthly-approvals/:id/unlock` | `@RequireAnyPermission(hr.view)` |
| `correctDailyLog` | POST | `hr/attendance/daily-logs/correct` | `@RequireAnyPermission(hr.view)` |
| `listScanReviews` | GET | `hr/attendance/scan-reviews` | `@RequireAnyPermission(hr.view)` |
| `reviewScanFlag` | PATCH | `hr/attendance/scan-reviews/:dailyLogId` | `@RequireAnyPermission(hr.view)` |
| `getEmployeeDailyLogs` | GET | `hr/attendance/:employeeId/month/:month/year/:year/daily-logs` | `@RequireAnyPermission(hr.view)` |
| `getEmployeeAttendance` | GET | `hr/attendance/:employeeId/year/:year` | `@RequireAnyPermission(hr.view)` |
| `getMyFlaggedDays` | GET | `hr/attendance/flagged-days/me` | `@DelegatePermissionCheck()` — service-layer only |
| `getEmployeeFlaggedDays` | GET | `hr/attendance/flagged-days/employee/:employeeId` | `@DelegatePermissionCheck()` — service-layer only |
| `createFieldMovementLog` | POST | `hr/attendance/field-movement-logs` | `@DelegatePermissionCheck()` — service-layer only |
| `upsertFieldMovementDraftEntries` | POST | `hr/attendance/field-movement-logs/draft-entries` | `@DelegatePermissionCheck()` — service-layer only |
| `removeFieldMovementDraftDay` | POST | `hr/attendance/field-movement-logs/draft-entries/remove-day` | `@DelegatePermissionCheck()` — service-layer only |
| `listFieldMovementLogs` | GET | `hr/attendance/field-movement-logs` | `@DelegatePermissionCheck()` — service-layer only |
| `getFieldMovementLog` | GET | `hr/attendance/field-movement-logs/:id` | `@DelegatePermissionCheck()` — service-layer only |
| `submitFieldMovementLog` | POST | `hr/attendance/field-movement-logs/:id/submit` | `@DelegatePermissionCheck()` — service-layer only |
| `cancelFieldMovementLog` | PATCH | `hr/attendance/field-movement-logs/:id/cancel` | `@DelegatePermissionCheck()` — service-layer only |
| `list` | GET | `hr/attendance` | `@DelegatePermissionCheck()` — service-layer only |
| `getMyAttendance` | GET | `hr/attendance/me` | `@DelegatePermissionCheck()` — service-layer only |

30 handlers total: 19 with `@RequireAnyPermission`, 11 with `@DelegatePermissionCheck`.

---

## Existing Permission Keys

### Decorator-level (`@RequireAnyPermission`)

All 19 guarded handlers use a single key — **`hr.view`**. No handler uses `attendance.*` at the HTTP layer.

| Key | Locations |
|---|---|
| `{ module: 'hr', action: 'view' }` | [attendance.controller.ts:63](../../../src/modules/attendance/presentation/attendance.controller.ts#L63), :96, :107, :114, :125, :137, :147, :164, :176, :197, :207, :222, :233, :244, :260, :271, :284, :485, :503 |

### Service-level (`hasPermission()` in `attendance.service.ts`)

All three calls use `'hr', 'view'` as a scope-broadening switch, not a hard block:

| Context | File:Line |
|---|---|
| `listRecords()` — company-wide vs own-only scope | [attendance.service.ts:1797](../../../src/modules/attendance/application/services/attendance.service.ts#L1797) |
| `getFieldMovementLog()` — HR access OR owner/creator/approver fallback | [attendance.service.ts:4630](../../../src/modules/attendance/application/services/attendance.service.ts#L4630) |
| `listFieldMovementLogs()` — company-wide vs own-only scope | [attendance.service.ts:4690](../../../src/modules/attendance/application/services/attendance.service.ts#L4690) |

### Seeds — Attendance Permission Rows in DB

**`backend/prisma/seed.ts`** lines 251–255 — five permission definitions:

| Key | Description |
|---|---|
| `attendance.view` | View attendance records |
| `attendance.create` | Import attendance data |
| `attendance.edit` | Correct attendance records |
| `attendance.approve` | Approve monthly attendance |
| `attendance.export` | Export attendance data |

**Role-permission assignments** (seed.ts lines 1332–1499):

| Role | Flags |
|---|---|
| `HR Manager` | All flags (`hrManagerFlags()`) |
| `Local HR Manager` | All flags (`localHrManagerFlags()`) |
| `HR Specialist` | view + export |
| `HR Assistant` | view + create |
| `Department Head` | view only |
| `Discipline Lead` | view only |
| `General Manager` | view only |
| `Employee` | view only |

None of the five `attendance.*` keys is used in any controller decorator or service `hasPermission()` call — the module is fully seeded but never referenced at runtime in the attendance handlers.

No SQL migrations insert attendance permission rows; all attendance permissions are seed-managed only.

---

## Approval Chain

### `FIELD_MOVEMENT_LOG` — "Field Movement / Early Departure Log"

Category: `FIELD_MOVEMENT_LOG`, module `HR`, prefix `FM`
[approval-categories.seed.ts:719](../../../prisma/seeds/approval-categories.seed.ts#L719)

Purpose: employee explains missing clock-ins, missing clock-outs, or early departures flagged in monthly attendance.

| Tier | Order | Seed Alias | Resolves To (ROLE_ALIASES) |
|---|---|---|---|
| Department Head | 1 | `DEPARTMENT_HEAD` | Role name: **Project Manager** |
| HR Officer | 2 | `HR` | Role name: **HR Officer** |

**Effective chain: Project Manager → HR Officer**

---

### `WORK_FROM_HOME` — "Work From Home"

Category: `WORK_FROM_HOME`, module `HR`, prefix `WFH`
[approval-categories.seed.ts:149](../../../prisma/seeds/approval-categories.seed.ts#L149)

| Tier | Order | Seed Alias | Resolution |
|---|---|---|---|
| Discipline Lead | 1 | `DISCIPLINE_LEAD` | NOT in approval-resolver `ROLE_ALIASES`; resolved at runtime by `HrApprovalChainService` → the submitter's assigned Discipline Leader user directly |

**Chain is code-driven, not rules-driven.** The seed explicitly documents: "Runtime chain is built in code, not from these rules." `DISCIPLINE_LEAD` is absent from [approval-resolver.service.ts:29](../../../src/modules/approvals/application/services/approval-resolver.service.ts#L29) ROLE_ALIASES.

---

### ROLE_ALIASES (full map, `approval-resolver.service.ts:29`)

| Alias | Resolves to Role.name |
|---|---|
| `MANAGER` | `Project Manager` |
| `PROJECT_MANAGER` | `Project Manager` |
| `DEPARTMENT_HEAD` | `Project Manager` |
| `HR` | `HR Officer` |
| `HR_MANAGER` | `HR Officer` |
| `FINANCE` | `Finance Manager` |
| `FINANCE_MANAGER` | `Finance Manager` |
| `DIRECTOR` | `Managing Director` |
| `GENERAL_MANAGER` | `General Manager` |
| `PROCUREMENT` | `Procurement Officer` |
| `LEGAL` | `Document Controller` |
| `ADMIN_MANAGER` | `Document Controller` |
| `SAFETY` | `Safety Officer` |
| `STORE` | `Storekeeper` |
| `WAREHOUSE_MANAGER` | `Storekeeper` |
| `ACCOUNTANT` | `Accountant` |
| `SITE` | `Site Engineer` |
| `EMPLOYEE` | `Employee` |

`DISCIPLINE_LEAD` is absent — WFH chain bypasses this map entirely.

---

## Gaps

### 1. Five `attendance.*` permission keys exist in the seed but are never used

`attendance.view`, `attendance.create`, `attendance.edit`, `attendance.approve`, `attendance.export` are seeded and granted to roles, but zero attendance handlers reference them. Every gated handler uses `hr.view` instead. The dedicated keys are dead weight — they appear on permission management UIs but have no effect on access control.

### 2. All write/mutate operations use the same key as read (`hr.view`)

`confirmImport`, `markAsReviewed`, `approveMonth`, `unlockMonth`, `correctDailyLog`, `updateIdentity`, `resolveImportMissing`, and `reviewScanFlag` all require only `hr.view` — the same key used for GET endpoints. Any HR user who can read attendance can also approve months, correct logs, and unlock locked periods.

### 3. 11 `@DelegatePermissionCheck` bypasses with no declarative key

| Handler | Route | Service check |
|---|---|---|
| `getMyFlaggedDays` | GET `hr/attendance/flagged-days/me` | Ownership (self only) — no hasPermission() |
| `getEmployeeFlaggedDays` | GET `hr/attendance/flagged-days/employee/:employeeId` | Service-level check (unspecified) |
| `createFieldMovementLog` | POST `hr/attendance/field-movement-logs` | Ownership/creation |
| `upsertFieldMovementDraftEntries` | POST `hr/attendance/field-movement-logs/draft-entries` | Ownership |
| `removeFieldMovementDraftDay` | POST `hr/attendance/field-movement-logs/draft-entries/remove-day` | Ownership |
| `listFieldMovementLogs` | GET `hr/attendance/field-movement-logs` | `hasPermission(hr, view)` scope switch |
| `getFieldMovementLog` | GET `hr/attendance/field-movement-logs/:id` | `hasPermission(hr, view)` OR owner/approver |
| `submitFieldMovementLog` | POST `hr/attendance/field-movement-logs/:id/submit` | Ownership/creation |
| `cancelFieldMovementLog` | PATCH `hr/attendance/field-movement-logs/:id/cancel` | Ownership |
| `list` | GET `hr/attendance` | `hasPermission(hr, view)` scope switch |
| `getMyAttendance` | GET `hr/attendance/me` | Ownership (self only) — no hasPermission() |

### 4. `getMyFlaggedDays` and `getMyAttendance` have no permission check of any kind

Both are `@DelegatePermissionCheck()` with service methods that only inject `userId` from the JWT. Any authenticated user can call them regardless of role or permission assignment.

### 5. FIELD_MOVEMENT_LOG approval tier labels do not match resolved roles

Seed tier labels say "Department Head" and "HR Officer" but resolve at runtime to `Project Manager` and `HR Officer` (same mismatch as the leave module's `LEAVE_REQUEST` chain). [approval-categories.seed.ts:719](../../../prisma/seeds/approval-categories.seed.ts#L719)

### 6. WFH approval chain has no fallback if employee has no Discipline Leader

`DISCIPLINE_LEAD` is code-resolved via `HrApprovalChainService` — if the submitting employee has no Discipline Leader assigned (`engineeringDisciplineId` is null, or the discipline has no `leaderId`), the WFH submission either errors or skips the tier. No fallback tier is defined in the seed rules.

---

## Proposed Actions

| Gap | Handler(s) | Proposed Action |
|---|---|---|
| `attendance.*` keys seeded but unused | All 19 guarded handlers | Wire existing `attendance.view` to all GET handlers; replace `hr.view` on read-only attendance endpoints |
| Write operations gated only on `hr.view` | `confirmImport`, `correctDailyLog`, `updateIdentity`, `resolveImportMissing` | Replace with `attendance.create` or `attendance.edit` as appropriate |
| Monthly approval actions gated only on `hr.view` | `markAsReviewed`, `approveMonth`, `unlockMonth` | Replace with `attendance.approve` |
| Field movement log handlers bypass guard | All 11 `@DelegatePermissionCheck` handlers | Add `attendance.view` as declarative key on read handlers; service checks remain as scope limiters |
| `getMyFlaggedDays` / `getMyAttendance` no check | GET `.../me` routes | Add `attendance.view` declarative key — every authenticated employee already has it |
| FIELD_MOVEMENT_LOG tier labels misleading | approval-categories seed | Update labels to `"Project Manager"` and `"HR Officer"` to match ROLE_ALIASES resolution |
| WFH no fallback if Discipline Leader absent | WFH approval chain | Add a fallback tier (e.g., `HR` alias → `HR Officer`) in the seed rules or handle in `HrApprovalChainService` |
