# Leave Module — Permissions Deep-Dive

_Read-only audit. No code was changed._

---

## Controllers & Handlers

### `LeaveController` — `@Controller('hr/leave-requests')`

Class guards: `@UseGuards(PermissionsGuard)` + `@RequireAnyPermission(hr.view | leave.view | leave.create)`
[leave.controller.ts:64](../../../src/modules/leave/presentation/controllers/leave.controller.ts#L64)

| Handler | Method | Path | Current Guard |
|---|---|---|---|
| `submit` | POST | `/hr/leave-requests` | `@DelegatePermissionCheck()` — service-layer only |
| `list` | GET | `/hr/leave-requests` | Class guard (hr.view \| leave.view \| leave.create) |
| `listMine` | GET | `/hr/leave-requests/my` | `@DelegatePermissionCheck()` — service-layer only |
| `getMyBalance` | GET | `/hr/leave-requests/balance` | `@DelegatePermissionCheck()` — service-layer only |
| `myBalances` | GET | `/hr/leave-requests/balances/me` | `@DelegatePermissionCheck()` — service-layer only |
| `listBalances` | GET | `/hr/leave-requests/balances` | `@RequireAnyPermission(hr.view)` |
| `getLedger` | GET | `/hr/leave-requests/balance-ledger` | `@DelegatePermissionCheck()` — service-layer only |
| `adjustBalance` | POST | `/hr/leave-requests/balance-ledger/adjustments` | `@RequireAnyPermission(hr.edit)` |
| `setOpeningBalance` | POST | `/hr/leave-requests/balance-ledger/opening` | `@RequireAnyPermission(hr.edit)` |
| `setBalanceSnapshot` | POST | `/hr/leave-requests/balance-ledger/snapshot` | `@RequireAnyPermission(hr.edit)` |
| `getOne` | GET | `/hr/leave-requests/:id` | `@DelegatePermissionCheck()` — service-layer only |
| `update` | PATCH | `/hr/leave-requests/:id` | `@RequireAnyPermission(hr.view \| leave.create)` |
| `cancel` | PATCH | `/hr/leave-requests/:id/cancel` | `@RequireAnyPermission(hr.view \| leave.create)` |
| `remove` | DELETE | `/hr/leave-requests/:id` | `@RequireAnyPermission(hr.view)` |

---

### `LeaveBalanceImportController` — `@Controller('hr/leave-balances/import')`

Class guards: `@UseGuards(PermissionsGuard)` + `@RequireAnyPermission(hr.create | hr.edit)`
[leave-balance-import.controller.ts:32](../../../src/modules/leave/presentation/controllers/leave-balance-import.controller.ts#L32)

`preview` and `import` additionally call `assertCanEditLeaveBalances()` (runtime role-name check).

| Handler | Method | Path | Current Guard |
|---|---|---|---|
| `downloadTemplate` | GET | `/hr/leave-balances/import/template` | Class guard (hr.create \| hr.edit) only — no role check |
| `preview` | POST | `/hr/leave-balances/import/preview` | Class guard + `assertCanEditLeaveBalances()` role check |
| `import` | POST | `/hr/leave-balances/import` | Class guard + `assertCanEditLeaveBalances()` role check |

`assertCanEditLeaveBalances()` checks role names: `System Administrator`, `General Manager`, `HR Officer`, `HR Manager`, `Local HR Manager`.
[leave-balance-access.util.ts](../../../src/modules/leave/application/utils/leave-balance-access.util.ts)

---

### `LeaveRequestImportController` — `@Controller('hr/leave-requests/import')`

Class guards: `@UseGuards(PermissionsGuard)` + `@RequireAnyPermission(hr.create | hr.view | leave.create)`
[leave-request-import.controller.ts:29](../../../src/modules/leave/presentation/controllers/leave-request-import.controller.ts#L29)

| Handler | Method | Path | Current Guard |
|---|---|---|---|
| `downloadTemplate` | GET | `/hr/leave-requests/import/template` | Class guard only |
| `preview` | POST | `/hr/leave-requests/import/preview` | Class guard only |
| `import` | POST | `/hr/leave-requests/import` | Class guard only |

---

## Existing Permission Keys

### Decorator-level (`@RequireAnyPermission`)

| Module | Action | Effective Key | Locations |
|---|---|---|---|
| `hr` | `view` | `hr.view` | [leave.controller.ts:66](../../../src/modules/leave/presentation/controllers/leave.controller.ts#L66) (class), :208, :314, :332, :349 |
| `leave` | `view` | `leave.view` | [leave.controller.ts:67](../../../src/modules/leave/presentation/controllers/leave.controller.ts#L67) (class) |
| `leave` | `create` | `leave.create` | [leave.controller.ts:68](../../../src/modules/leave/presentation/controllers/leave.controller.ts#L68) (class), :315, :333 |
| `hr` | `edit` | `hr.edit` | [leave.controller.ts:240](../../../src/modules/leave/presentation/controllers/leave.controller.ts#L240), :259, :278 |
| `hr` | `create` | `hr.create` | [leave-balance-import.controller.ts:34](../../../src/modules/leave/presentation/controllers/leave-balance-import.controller.ts#L34), [leave-request-import.controller.ts:31](../../../src/modules/leave/presentation/controllers/leave-request-import.controller.ts#L31) |

### Service-level (`hasPermission()` in `leave.service.ts`)

All five service-level calls use `module='hr', action='view'` (`hr.view`):

| Context | File:Line |
|---|---|
| `cancelRequest` — HR cancel gate | [leave.service.ts:490](../../../src/modules/leave/application/services/leave.service.ts#L490) |
| `deleteRequest` — HR-only delete gate | [leave.service.ts:644](../../../src/modules/leave/application/services/leave.service.ts#L644) |
| `assertCanManageLeaveRequest` — owner-or-HR gate | [leave.service.ts:717](../../../src/modules/leave/application/services/leave.service.ts#L717) |
| `listRequests` — scope broadening (all employees vs. own) | [leave.service.ts:836](../../../src/modules/leave/application/services/leave.service.ts#L836) |
| `assertCanViewLeaveRequest` — owner/approver/HR gate | [leave.service.ts:936](../../../src/modules/leave/application/services/leave.service.ts#L936) |

### Seeds — Leave Permission Rows in DB

**`backend/prisma/seed-leave-permissions.ts`**
- Upserts `leave.view` ("View leave requests and balances") and `leave.create` ("Submit and cancel leave requests")
- Grants to: `System Administrator` (all flags), `Employee` (canView + canCreate), `HR Officer` (canView + canCreate)

**`backend/prisma/seed.ts`** lines 124–125, 1328–1440
- `leave.view` and `leave.create` defined as module permission entries
- Role grants: `HR Manager` (:1328), `Local HR Manager` (:1350), `HR Specialist` (:1377, view+export), `HR Assistant` (:1406, view-only), `Department Head` (:1424, view-only), `Employee` (:1440, view+create)

**`backend/prisma/seed-hr-permissions.ts`** line 96
- `leave.create` granted to additional roles via HR permissions seeder
- Line 148: bulk revocation removes `hr`, `leave`, `overtime` module permissions from `Project Manager` / `Project Administrator`

**`backend/prisma/seeds/approval-categories.seed.ts`** lines 70–122
- `LEAVE_REQUEST` approval category — `permissionModule: 'leave'` (resolved via `approval-category-permission.util.ts:10`)
- `SITE_ASSIGNMENT` and `WORK_FROM_HOME` also resolve to `permissionModule: 'leave'` (:11–12)

No SQL migrations insert leave permission rows; all leave permissions are seed-managed only.

---

## Approval Chain

**Category:** `LEAVE_REQUEST` — [approval-categories.seed.ts:97](../../../prisma/seeds/approval-categories.seed.ts#L97)

Three rules are defined (short leave ≤3 days, long leave >3 days, catch-all default); all three resolve to the same two-tier chain:

| Tier | Order | Seed Alias | Resolves To (ROLE_ALIASES) |
|---|---|---|---|
| Tier 1 — Department Head | 1 | `DEPARTMENT_HEAD` | Role name `Project Manager` |
| Tier 2 — HR Manager | 2 | `HR_MANAGER` | Role name `HR Officer` |

**Effective chain: Project Manager → HR Officer**

ROLE_ALIASES source: [approval-resolver.service.ts:29](../../../src/modules/approvals/application/services/approval-resolver.service.ts#L29)

Resolution logic (`resolveRule()` at :79): matches the first passing `when` condition, then finds the first active user assigned to the resolved role (ordered by `createdAt asc`). Throws `BadRequestException` with `vacantApproverMessage` if no user holds the role.

The label "Department Head" in the seed is misleading — at runtime it resolves to whoever holds the `Project Manager` role, not a `Department Head` role. Similarly "HR Manager" resolves to `HR Officer`.

---

## Gaps

### 1. `@DelegatePermissionCheck` bypasses with no dedicated permission key

Six handlers bypass the class-level permission guard and rely solely on service-layer ownership/approver checks:

| Handler | Route | Service check |
|---|---|---|
| `submit` | POST `/hr/leave-requests` | Ownership (submits for self or delegate) |
| `listMine` | GET `/hr/leave-requests/my` | Ownership (self only) |
| `getMyBalance` | GET `/hr/leave-requests/balance` | Ownership (self only) |
| `myBalances` | GET `/hr/leave-requests/balances/me` | Ownership (self only) |
| `getLedger` | GET `/hr/leave-requests/balance-ledger` | Ownership check in service |
| `getOne` | GET `/hr/leave-requests/:id` | `assertCanViewLeaveRequest` (owner/approver/hr.view) |

These have no declarative permission key at the HTTP layer. Any authenticated user (regardless of role or permission) can reach them; access control is entirely implicit.

### 2. `LeaveRequestImportController` — all employees can import

The class guard allows `leave.create`, which every `Employee` role holds. This means any employee can POST to `/hr/leave-requests/import` (bulk import). There is no additional service-level role check (unlike the balance import controller which adds `assertCanEditLeaveBalances()`).

### 3. `downloadTemplate` in `LeaveBalanceImportController` skips role check

`downloadTemplate` (GET `/hr/leave-balances/import/template`) passes the class guard (`hr.create | hr.edit`) but does NOT call `assertCanEditLeaveBalances()`. Any user with `hr.create` or `hr.edit` can download the template even if they cannot use the `preview` or `import` endpoints.

### 4. Approval chain labels do not match resolved roles

The seed uses labels `"Department Head"` and `"HR Manager"` but ROLE_ALIASES resolves them to `Project Manager` and `HR Officer` respectively. This creates confusion in the UI (the displayed tier name doesn't match the role that actually approves). [approval-resolver.service.ts:29](../../../src/modules/approvals/application/services/approval-resolver.service.ts#L29)

### 5. No `leave.delete` or `leave.edit` permission key exists

`remove` (DELETE) uses `hr.view` as its gate — any HR viewer can delete leave requests. `update` (PATCH) uses `hr.view | leave.create` — employees can update their own (the service does an ownership check) but the gate is the same key as create, not a dedicated `leave.edit`.

### 6. `leave.view` is only used on the class guard; `leave.create` overloads submission + cancellation

`cancel` (PATCH `:id/cancel`) requires `leave.create`, not a separate cancel permission. An employee who can create can also cancel (including cancelling others' requests if they somehow pass the service ownership check).

---

## Proposed Actions

| Gap | Handler(s) | Proposed Action |
|---|---|---|
| `submit` bypasses guard | POST `/hr/leave-requests` | Add `leave.create` declarative key; `@DelegatePermissionCheck` can stay but document it |
| `listMine` / `getMyBalance` / `myBalances` bypass guard | GET `/hr/leave-requests/my`, `/balance`, `/balances/me` | Reuse `leave.view` — any authenticated employee already has it; add as declarative key |
| `getLedger` bypasses guard | GET `/hr/leave-requests/balance-ledger` | Add `leave.view` declarative key; service check remains as scope limiter |
| `getOne` bypasses guard | GET `/hr/leave-requests/:id` | Add `leave.view` declarative key; `assertCanViewLeaveRequest` handles scope |
| `LeaveRequestImportController` open to all employees | POST `/hr/leave-requests/import` | Add `assertCanEditLeaveRequests()` role check to `preview` and `import` handlers (matching balance import pattern) |
| `downloadTemplate` skips role check | GET `/hr/leave-balances/import/template` | Leave as-is — template download is low-risk and the class guard is sufficient |
| Approval tier labels misleading | approval-categories seed | Update seed labels to `"Project Manager"` and `"HR Officer"` to match ROLE_ALIASES resolution |
| No `leave.delete` key | DELETE `/hr/leave-requests/:id` | Add `leave.delete` permission key; update seed; replace `hr.view` gate with `leave.delete` |
| No `leave.edit` key | PATCH `/hr/leave-requests/:id` | Add `leave.edit` permission key; update seed; replace `hr.view | leave.create` gate |
| `cancel` reuses `leave.create` | PATCH `/hr/leave-requests/:id/cancel` | Leave as-is for now — creating and cancelling your own request is the same capability; revisit if a delegate-cancel use case arises |
