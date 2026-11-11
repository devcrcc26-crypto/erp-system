# Work Schedule Module — Permissions Deep-Dive

_Read-only audit. No code was changed._

Scope: **work schedules**, **public holidays**, and **work from home (WFH)** under `backend/src/modules/work-schedule/`. No other controllers own these three concerns (WFH is exposed at `hr/attendance/work-from-home` for routing alongside attendance UI).

---

## Controllers & Handlers

### `WorkScheduleController` — `@Controller('hr/work-schedules')`

Class guards: `@UseGuards(PermissionsGuard)` only — **no class-level permission**; each handler must declare its own decorator or `@DelegatePermissionCheck()`.
[work-schedule.controller.ts:29](../../../src/modules/work-schedule/presentation/work-schedule.controller.ts#L29)

| Handler | Method | Path | Current Guard |
|---|---|---|---|
| `previewDays` | POST | `/hr/work-schedules/preview-days` | `@DelegatePermissionCheck()` — service scopes preview to self or on-behalf-eligible / `hr.view` |
| `mySchedule` | GET | `/hr/work-schedules/my` | `@DelegatePermissionCheck()` — any authenticated user |
| `employeeSchedule` | GET | `/hr/work-schedules/employees/:employeeId` | `@RequireAnyPermission(hr.view \| users.view)` |
| `list` | GET | `/hr/work-schedules` | `@RequireAnyPermission(hr.view \| users.view)` |
| `get` | GET | `/hr/work-schedules/:id` | `@RequirePermission(hr.view)` |
| `create` | POST | `/hr/work-schedules` | `@RequirePermission(hr.view)` |
| `update` | PATCH | `/hr/work-schedules/:id` | `@RequirePermission(hr.view)` |
| `remove` | DELETE | `/hr/work-schedules/:id` | `@RequirePermission(hr.view)` |
| `setDefault` | POST | `/hr/work-schedules/:id/set-default` | `@RequirePermission(hr.view)` |
| `assign` | POST | `/hr/work-schedules/:id/assign` | `@RequirePermission(hr.view)` |

---

### `PublicHolidayController` — `@Controller('hr/public-holidays')`

Class guards: `@UseGuards(PermissionsGuard)` + `@RequirePermission('hr', 'view')`
[public-holiday.controller.ts:31](../../../src/modules/work-schedule/presentation/public-holiday.controller.ts#L31)

| Handler | Method | Path | Current Guard |
|---|---|---|---|
| `list` | GET | `/hr/public-holidays` | Class guard (`hr.view`) |
| `myUpcoming` | GET | `/hr/public-holidays/my/upcoming` | `@DelegatePermissionCheck()` — any authenticated user |
| `bulkStatus` | POST | `/hr/public-holidays/bulk-status` | Class guard (`hr.view`) |
| `duplicateYear` | POST | `/hr/public-holidays/duplicate-year` | Class guard (`hr.view`) |
| `get` | GET | `/hr/public-holidays/:id` | Class guard (`hr.view`) |
| `create` | POST | `/hr/public-holidays` | Class guard (`hr.view`) |
| `update` | PATCH | `/hr/public-holidays/:id` | Class guard (`hr.view`) |
| `remove` | DELETE | `/hr/public-holidays/:id` | Class guard (`hr.view`) |

---

### `WorkFromHomeDayController` — `@Controller('hr/attendance/work-from-home')`

Class guards: `@UseGuards(PermissionsGuard)` + **`@DelegatePermissionCheck()` on the class** — every handler skips declarative permission checks; only authentication is enforced at HTTP layer.
[work-from-home-day.controller.ts:30](../../../src/modules/work-schedule/presentation/work-from-home-day.controller.ts#L30)

| Handler | Method | Path | Current Guard |
|---|---|---|---|
| `list` | GET | `/hr/attendance/work-from-home` | Class `@DelegatePermissionCheck()` — service: `hr.view` via `assertCanAssign` |
| `listAssignable` | GET | `/hr/attendance/work-from-home/assignable-employees` | Class delegate — service: `hr.view` only |
| `preview` | POST | `/hr/attendance/work-from-home/preview` | Class delegate — service: `resolveInitiation(WORK_FROM_HOME)` |
| `cancelRequest` | POST | `/hr/attendance/work-from-home/requests/:approvalRequestId/cancel` | Class delegate — service: owner/filer or `hr.view` |
| `request` | POST | `/hr/attendance/work-from-home/request` | Class delegate — service: `resolveInitiation(WORK_FROM_HOME)` |
| `create` | POST | `/hr/attendance/work-from-home` | Class delegate — service: `hr.view` direct assign only |
| `update` | PATCH | `/hr/attendance/work-from-home/:id` | Class delegate — service: `hr.view` only |
| `remove` | DELETE | `/hr/attendance/work-from-home/:id` | Class delegate — service: `hr.view` only |

**Controller summary:** 3 classes, **26** HTTP handlers (10 + 8 + 8).

---

## Existing Permission Keys

### Decorator-level (`@RequirePermission` / `@RequireAnyPermission`)

| Module | Action | Effective Key | Locations |
|---|---|---|---|
| `hr` | `view` | `hr.view` | [work-schedule.controller.ts:63-64,78,87,97,108,125,143,154](../../../src/modules/work-schedule/presentation/work-schedule.controller.ts); class [public-holiday.controller.ts:32](../../../src/modules/work-schedule/presentation/public-holiday.controller.ts) |
| `users` | `view` | `users.view` | [work-schedule.controller.ts:64,79](../../../src/modules/work-schedule/presentation/work-schedule.controller.ts) |

There is **no** `work-schedule`, `public-holiday`, or `work-from-home` permission module in seeds or decorators.

### Service-level (`hasPermission()` / assigner checks)

All service calls use `module='hr', action='view'` (`hr.view`):

| Context | File:Line |
|---|---|
| `WorkScheduleService.resolvePreviewEmployee` — non-self preview-days target | [work-schedule.service.ts:1243](../../../src/modules/work-schedule/application/services/work-schedule.service.ts#L1243) |
| `WorkFromHomeDayService.cancelRequest` — HR cancel of approved WFH | [work-from-home-day.service.ts:717](../../../src/modules/work-schedule/application/services/work-from-home-day.service.ts#L717) |
| `WorkFromHomeDayService.resolveAssigner` — list / direct assign / update / delete | [work-from-home-day.service.ts:1076](../../../src/modules/work-schedule/application/services/work-from-home-day.service.ts#L1076) |

`PublicHolidayService` has **no** `hasPermission()` calls — access is entirely the controller `hr.view` gate (except `myUpcoming`).

WFH employee **requests** (`submitRequest`, `previewRange`) use `OnBehalfService.resolveInitiation(..., 'WORK_FROM_HOME')` instead of permission keys ([work-from-home-day.service.ts:543](../../../src/modules/work-schedule/application/services/work-from-home-day.service.ts), [576](../../../src/modules/work-schedule/application/services/work-from-home-day.service.ts)).

### Seeds — permission rows

**No dedicated permission module** for work schedules, public holidays, or WFH.

- `backend/prisma/seed.ts` — `PERMISSION_DEFINITIONS` includes PM module `schedule.*` (project Gantt), **not** HR work schedules ([seed.ts:163-168](../../../prisma/seed.ts)).
- `backend/prisma/seed/work-schedules.seed.ts` — reference **schedule templates and holidays data**, not RBAC rows.
- SQL migrations create `work_schedule`, `public_holiday`, `work_from_home_day` tables only ([20260910100000_work_schedule_public_holidays/migration.sql](../../../prisma/migrations/20260910100000_work_schedule_public_holidays/migration.sql), [20261005100000_attendance_paid_days_wfh/migration.sql](../../../prisma/migrations/20261005100000_attendance_paid_days_wfh/migration.sql)).
- `backend/prisma/scripts/upsert-work-from-home-category.ts` — approval category metadata only; **still describes Discipline Lead-only chain** (stale vs runtime).

Approvals UI permission for WFH category code resolves via `WORK_FROM_HOME → leave` in [approval-category-permission.util.ts:12](../../../src/modules/approvals/application/utils/approval-category-permission.util.ts).

---

## Approval Chain

**Category:** `WORK_FROM_HOME` — [approval-categories.seed.ts:149](../../../prisma/seeds/approval-categories.seed.ts#L149)

Seed metadata (documentation; **not used at runtime** for tier resolution):

| Tier | Order | Seed label | Seed resolver | ROLE_ALIASES resolution |
|---|---|---|---|---|
| 1 | 1 | Reports to | `EMPLOYEE` | Alias `EMPLOYEE` → role name `Employee` (misleading label; not how runtime resolves tier 1) |
| 2 | 2 | HR Officer | `HR` | `HR` → `HR Officer` ([approval-resolver.service.ts:33-34](../../../src/modules/approvals/application/services/approval-resolver.service.ts)) |

**Runtime chain** (authoritative): `HrApprovalChainService.buildWorkFromHomeApprovalChain()` — [hr-approval-chain.service.ts:511-549](../../../src/modules/hr-shared/application/services/hr-approval-chain.service.ts#L511)

| Tier | Label | Resolver | How approver is chosen |
|---|---|---|---|
| 1 | Reports to | `REPORTS_TO` | `User.reportsToUserId` via `getReportsToRequired()` — **matches product expectation (direct supervisor / reports-to)** |
| 2 | HR Officer | `ROLE:HR Officer` | Active user holding `HR Officer` role |

**Confirmed:** current runtime chain is **Reports to (supervisor from `reportsToUserId`) → HR Officer**, not Discipline Lead. This matches the attendance-module WFH update noted in the seed description ([approval-categories.seed.ts:152-156](../../../prisma/seeds/approval-categories.seed.ts)).

Additional runtime behaviour:

- **GM / Managing Director / System Administrator** submitters → empty chain → auto-approve ([hr-approval-chain.service.ts:520-521](../../../src/modules/hr-shared/application/services/hr-approval-chain.service.ts)).
- **Supervisor on-behalf** filing → `startChainAboveSubmitter()` removes submitter from their own tier ([work-from-home-day.service.ts:612-617](../../../src/modules/work-schedule/application/services/work-from-home-day.service.ts)).
- **Direct HR assignment** (`POST /hr/attendance/work-from-home`) bypasses approval entirely ([work-from-home-day.service.ts:281](../../../src/modules/work-schedule/application/services/work-from-home-day.service.ts)).
- Stale strings in code: submit path still passes `ruleName: 'Work from home - Discipline Lead only'` ([work-from-home-day.service.ts:671](../../../src/modules/work-schedule/application/services/work-from-home-day.service.ts)); service header comment still references Discipline Lead ([work-from-home-day.service.ts:126-128](../../../src/modules/work-schedule/application/services/work-from-home-day.service.ts)).

Public holidays and work schedule templates have **no** approval category.

---

## Gaps

### 1. `@DelegatePermissionCheck` — guard skipped (11 handlers)

| Handler(s) | Route prefix | Service / notes |
|---|---|---|
| `previewDays`, `mySchedule` | `/hr/work-schedules` | Preview scoped in service; my schedule is self-only |
| `myUpcoming` | `/hr/public-holidays` | Nationality-filtered holidays for caller |
| **All 8 WFH handlers** | `/hr/attendance/work-from-home` | Class-level delegate; mixed HR-only assign vs employee request paths |

When `@DelegatePermissionCheck()` is present, `PermissionsGuard` returns after auth and **does not evaluate** handler-level `@RequireAnyPermission` if added later ([permissions.guard.ts:38-46](../../../src/shared/permissions/permissions.guard.ts)).

### 2. Handlers reachable with no permission key at HTTP layer (11)

Same 11 handlers as §1: any authenticated user hits the controller; enforcement is implicit in services (or absent for `mySchedule` / `myUpcoming` beyond company tenancy).

### 3. Work schedule mutations gated by `hr.view`, not `hr.edit`

Create, update, delete, set-default, and assign all require `hr.view` only ([work-schedule.controller.ts:97-167](../../../src/modules/work-schedule/presentation/work-schedule.controller.ts)). Any HR viewer can mutate schedules.

### 4. Public holiday mutations also `hr.view` only

Class-level `hr.view` covers create/update/delete/bulk operations — no separate edit/delete permission.

### 5. WFH controller/API docs vs implementation

- Controller summaries still say “HR or Discipline Lead” ([work-from-home-day.controller.ts:37,109](../../../src/modules/work-schedule/presentation/work-from-home-day.controller.ts)); **direct assign/list/update/delete are HR-only** (`assertCanAssign` → `hr.view`).
- `listAssignableEmployees` returns `isDisciplineLead: false` always ([work-from-home-day.service.ts:265-266](../../../src/modules/work-schedule/application/services/work-from-home-day.service.ts)).

### 6. No module-specific permission keys

Unlike `leave.*` / `overtime.*`, work schedule, public holidays, and WFH have no seed rows or decorator keys — everything routes through `hr.view`, `users.view`, or auth-only delegates.

### 7. Stale WFH approval documentation in repo

- `prisma/scripts/upsert-work-from-home-category.ts` — Discipline Lead-only tiers.
- `submitRequest` `ruleName` and file-level comments — Discipline Lead-only wording.
- Seed category rules use resolver `EMPLOYEE` for tier 1 while runtime uses `REPORTS_TO`.

### 8. WFH tied to `leave` module for approval-category permissions

`WORK_FROM_HOME` → `leave` in approval-category-permission.util may confuse RBAC reporting for WFH approvers.

---

## Proposed Actions

| Gap | Handler(s) | Proposed Action |
|---|---|---|
| WFH class-level delegate | All `/hr/attendance/work-from-home/*` | Remove class `@DelegatePermissionCheck()`; add declarative keys (e.g. `leave.view` / dedicated `wfh.*`) per handler; keep service scope checks |
| `mySchedule` / `previewDays` bypass | POST preview-days, GET my | Add declarative read key or document as intentional self-service; keep service preview scoping |
| `myUpcoming` bypass | GET my/upcoming | Add lightweight read key or shared `hr.view` optional path for employees |
| Schedule CRUD uses `hr.view` | POST/PATCH/DELETE/assign on work-schedules | Gate mutations with `hr.edit` (or new `work-schedule.edit`) |
| Holiday admin uses `hr.view` | POST/PATCH/DELETE/bulk on public-holidays | Gate writes with `hr.edit` or dedicated `public-holiday.manage` |
| No module permission rows | Seeds | Introduce optional `work-schedule` / `public-holiday` / `wfh` permission modules and role grants if HR matrix needs finer control |
| Stale Discipline Lead docs | WFH service + upsert script + submit ruleName | Align comments, seed script, and `ruleName` with Reports to → HR Officer runtime chain |
| WFH → `leave` permission mapping | Approvals util | Revisit `WORK_FROM_HOME` permissionModule (e.g. `hr` or dedicated module) for approval inbox filtering |
| Employee WFH request path | POST request, POST preview | Add declarative `leave.create`-class key or `wfh.create` aligned with on-behalf policy |
