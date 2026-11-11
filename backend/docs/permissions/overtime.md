# Overtime Module — Permissions Deep-Dive

_Read-only audit. No code was changed._

---

## Controllers & Handlers

### `OvertimeController` — `@Controller('hr/overtime')`

Class guards: `@UseGuards(PermissionsGuard)` + `@RequireAnyPermission(hr.view | overtime.view | overtime.create)`
[overtime.controller.ts:43](../../../src/modules/overtime/presentation/controllers/overtime.controller.ts#L43)

`overtime.create` is granted to the `Employee` role, so every employee passes the class-level gate. Write-operation enforcement is entirely service-level.

| Handler | Method | Path | Current Guard |
|---|---|---|---|
| `list` | GET | `hr/overtime` | Class guard (hr.view \| overtime.view \| overtime.create) |
| `current` | GET | `hr/overtime/current` | Class guard |
| `openSheet` | POST | `hr/overtime/sheets` | Class guard |
| `previewEntry` | POST | `hr/overtime/preview-entry` | Class guard |
| `selectableWindows` | GET | `hr/overtime/selectable-windows` | Class guard |
| `downloadSheetImportTemplate` | GET | `hr/overtime/:id/entries/import/template` | Class guard |
| `previewSheetImport` | POST | `hr/overtime/:id/entries/import/preview` | Class guard |
| `commitSheetImport` | POST | `hr/overtime/:id/entries/import` | Class guard |
| `getOne` | GET | `hr/overtime/:id` | `@RequireAnyPermission(hr.view \| overtime.view \| overtime.create \| approvals.view)` |
| `addEntry` | POST | `hr/overtime/:id/entries` | Class guard |
| `updateEntry` | PATCH | `hr/overtime/:id/entries/:entryId` | Class guard |
| `addEntryAttachments` | POST | `hr/overtime/:id/entries/:entryId/attachments` | Class guard |
| `removeEntryAttachment` | DELETE | `hr/overtime/:id/entries/:entryId/attachments/:documentId` | Class guard |
| `deleteEntry` | DELETE | `hr/overtime/:id/entries/:entryId` | Class guard |
| `submit` | POST | `hr/overtime/:id/submit` | Class guard |
| `cancel` | PATCH | `hr/overtime/:id/cancel` | Class guard |
| `deleteSheet` | DELETE | `hr/overtime/:id` | Class guard (service adds `hr.view` gate) |

---

### `OvertimeImportController` — `@Controller('hr/overtime/import')`

Class guards: `@UseGuards(PermissionsGuard)` + `@RequireAnyPermission(hr.create | hr.view | overtime.create)`
[overtime-import.controller.ts:27](../../../src/modules/overtime/presentation/controllers/overtime-import.controller.ts#L27)

| Handler | Method | Path | Current Guard |
|---|---|---|---|
| `downloadTemplate` | GET | `hr/overtime/import/template` | Class guard (hr.create \| hr.view \| overtime.create) |
| `preview` | POST | `hr/overtime/import/preview` | Class guard |
| `import` | POST | `hr/overtime/import` | Class guard |

---

## Existing Permission Keys

### Decorator-level (`@RequireAnyPermission`)

| Key | Locations |
|---|---|
| `{ module: 'hr', action: 'view' }` | [overtime.controller.ts:46](../../../src/modules/overtime/presentation/controllers/overtime.controller.ts#L46) (class), :215 (`getOne`) |
| `{ module: 'overtime', action: 'view' }` | [overtime.controller.ts:47](../../../src/modules/overtime/presentation/controllers/overtime.controller.ts#L47) (class), :216 |
| `{ module: 'overtime', action: 'create' }` | [overtime.controller.ts:48](../../../src/modules/overtime/presentation/controllers/overtime.controller.ts#L48) (class), :217; [overtime-import.controller.ts:34](../../../src/modules/overtime/presentation/controllers/overtime-import.controller.ts#L34) |
| `{ module: 'approvals', action: 'view' }` | [overtime.controller.ts:220](../../../src/modules/overtime/presentation/controllers/overtime.controller.ts#L220) (`getOne` only) |
| `{ module: 'hr', action: 'create' }` | [overtime-import.controller.ts:30](../../../src/modules/overtime/presentation/controllers/overtime-import.controller.ts#L30) |

### Service-level (`hasPermission()`)

All calls use `'hr', 'view'`:

| Context | File:Line |
|---|---|
| `listSheets()` — company-wide vs own-only scope | [overtime.service.ts:385](../../../src/modules/overtime/application/services/overtime.service.ts#L385) |
| `deleteSheet()` — HR-only delete gate | [overtime.service.ts:1012](../../../src/modules/overtime/application/services/overtime.service.ts#L1012) |
| `assertCanViewSheet()` — HR viewer can read any sheet | [overtime.service.ts:1143](../../../src/modules/overtime/application/services/overtime.service.ts#L1143) |
| `canActForEmployee()` — HR can act for other employees | [overtime.service.ts:1180](../../../src/modules/overtime/application/services/overtime.service.ts#L1180) |
| `resolvePreviewEmployee()` — HR can preview other employees | [overtime-entry.service.ts:660](../../../src/modules/overtime/application/services/overtime-entry.service.ts#L660) |

### Seeds — Overtime Permission Rows in DB

**`backend/prisma/seed.ts`** lines 129–130:
- `overtime.view` — "View overtime requests"
- `overtime.create` — "Submit and cancel overtime requests"

Role grants (lines 1331–1765):

| Role | Flags |
|---|---|
| `HR Manager` | All flags |
| `Local HR Manager` | All flags |
| `HR Specialist` | view + export |
| `HR Assistant` | view only |
| `Department Head` | view only |
| `Employee` | view + create (own requests) |

**`backend/prisma/seed-overtime-permissions.ts`** lines 13–29:
- Upserts `overtime.view` and `overtime.create`
- Grants `overtime.view` to: System Administrator, HR Officer, General Manager, Managing Director
- Grants `overtime.create` also to: Employee

No SQL migrations insert overtime permission rows; all overtime permissions are seed-managed only.

---

## Approval Chain

**Category:** `OVERTIME_APPLICATION`, module `HR`, prefix `OT`
[approval-categories.seed.ts:582](../../../prisma/seeds/approval-categories.seed.ts#L582)

### Seed-defined rules (used by generic resolver; not the actual runtime path)

| Rule | Condition | Tier 1 Alias | Tier 2 Alias |
|---|---|---|---|
| Short overtime | hours ≤ 4 | `DEPARTMENT_HEAD` | — |
| Extended overtime | hours > 4 | `DEPARTMENT_HEAD` | `HR_MANAGER` |
| Default (fallback) | — | `DEPARTMENT_HEAD` | `HR_MANAGER` |

Alias resolution via `approval-resolver.service.ts:29`:
- `DEPARTMENT_HEAD` → **Project Manager**
- `HR_MANAGER` → **HR Officer**

### Actual runtime chain (`buildOrgApprovalChain`)

At submit time, `overtime.service.ts:856` calls `hrApprovalChain.buildOrgApprovalChain(sheet.employeeId, companyId, totalHours > 4)`. The `totalHours > 4` flag is accepted as `_includeGeneralManager` but immediately discarded (`void _includeGeneralManager` — [hr-approval-chain.service.ts:1251](../../../src/modules/hr-shared/application/services/hr-approval-chain.service.ts#L1251)). The chain is purely role-based:

| Submitter role | Runtime chain |
|---|---|
| GM / Managing Director / System Administrator | Empty — auto-approved |
| HR Officer / HR Manager | Tier 1: General Manager |
| HR Assistant / HR Specialist / Local HR Manager | Tier 1: HR Manager (→ HR Officer fallback) |
| Department Head | Tier 1: General Manager → Tier 2: HR Manager |
| Discipline Lead | Tier 1: Department Head (optional, skipped if unassigned) → Tier 2: HR Manager |
| Standard employee | Tier 1: Reports to (required; throws if unset) → Tier 2: HR Manager |

`getHRManager()` prefers role `HR Manager`, falls back to `HR Officer` if none is assigned.
[hr-approval-chain.service.ts:1591](../../../src/modules/hr-shared/application/services/hr-approval-chain.service.ts#L1591)

---

## Gaps

### 1. Class-level guard allows every employee through for all handlers

`overtime.create` (granted to all `Employee` roles) satisfies the class-level `@RequireAnyPermission`. Handlers like `deleteSheet`, `deleteEntry`, `commitSheetImport`, and `updateEntry` are therefore reachable by any authenticated employee at the HTTP layer. HR enforcement happens only inside service methods (`deleteSheet` via `hasPermission(hr.view)`). Other handlers — `addEntry`, `updateEntry`, `removeEntryAttachment`, `deleteEntry`, `cancel` — have no service-level HR gate at all; they rely entirely on ownership checks.

### 2. No `overtime.edit` or `overtime.delete` permission key exists

Destructive and mutating operations (`deleteSheet`, `deleteEntry`, `updateEntry`, `cancel`) all pass via `overtime.create` (same key as submit). An employee who can submit can also cancel and delete within their own scope.

### 3. `getOne` has a 4-key `@RequireAnyPermission` including `approvals.view`

`getOne` (GET `/hr/overtime/:id`) adds `approvals.view` to the class-level keys. This is the only handler with this key, and it is not matched by any explicit `approvals.view` check anywhere else in the module. The rationale is presumably to allow approvers to read the sheet; however `overtime.create` (held by every employee) already satisfies the gate, making `approvals.view` redundant.

### 4. `OvertimeImportController` class guard allows any employee through via `overtime.create`

The import endpoints (`preview`, `import`) are intended for HR use but are reachable by any employee with `overtime.create`. Unlike the attendance balance import controller, there is no `assertCanEditOvertimeImport()` service-level role check on these handlers.

### 5. `_includeGeneralManager` parameter is always discarded

The short/extended overtime split (hours ≤/> 4) defined in the seed rules is never applied at runtime — `buildOrgApprovalChain` ignores the flag entirely. The seed's two-rule distinction is dead documentation.

### 6. Seed approval-rule tiers use stale labels

The seed tier labels say "Department Head" and "HR Manager" (approval-categories.seed.ts:595–610) but runtime ROLE_ALIASES resolve `DEPARTMENT_HEAD` → `Project Manager` and `HR_MANAGER` → `HR Officer`. Same label-mismatch pattern as Leave and Field Movement Log.

---

## Proposed Actions

| Gap | Handler(s) | Proposed Action |
|---|---|---|
| All employees reach all write handlers via `overtime.create` | `deleteSheet`, `deleteEntry`, `updateEntry`, `addEntry`, `removeEntryAttachment`, `cancel` | Add `overtime.edit` and `overtime.delete` permission keys; gate mutating handlers on appropriate key rather than relying solely on service-layer ownership checks |
| No `overtime.delete` key | `deleteSheet` (HR only at service layer) | Add `overtime.delete`; gate `deleteSheet` on it; update seed |
| No `overtime.edit` key | `updateEntry`, `addEntry`, `removeEntryAttachment` | Add `overtime.edit`; gate on it; update seed |
| Import endpoints open to all employees | POST `hr/overtime/import/preview` and `hr/overtime/import` | Add service-level role check (`assertCanManageOvertimeImport()` matching attendance balance-import pattern) to `preview` and `import` handlers |
| `approvals.view` redundant on `getOne` | GET `hr/overtime/:id` | Remove `approvals.view` from `getOne`; `overtime.create` already covers all users who need it |
| `_includeGeneralManager` always discarded | `overtime.service.ts:856` | Either implement the hours-based chain split or remove the parameter and simplify the call to `buildOrgApprovalChain(employeeId, companyId, false)` |
| Seed tier labels misleading | `approval-categories.seed.ts:595–610` | Update labels `"Department Head"` → `"Project Manager"`, `"HR Manager"` → `"HR Officer"` to match ROLE_ALIASES runtime resolution |
