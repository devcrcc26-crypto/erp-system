# Site Assignment Module — Permissions Deep-Dive

_Read-only audit. No code was changed._

---

## Controllers & Handlers

### `SiteAssignmentController` — `@Controller('hr/site-assignments')`

Class guards: `@UseGuards(PermissionsGuard)` + `@RequireAnyPermission(hr.view | leave.view | leave.create)`
[site-assignment.controller.ts:31](../../../src/modules/site-assignment/presentation/controllers/site-assignment.controller.ts#L31)

Because `leave.create` is granted to the `Employee` role, **every employee passes the class-level gate** unless a handler adds stricter decorators (none do except `submit`, which bypasses the guard entirely).

| Handler | Method | Path | Current Guard |
|---|---|---|---|
| `submit` | POST | `/hr/site-assignments` | `@DelegatePermissionCheck()` — service-layer only (`resolveInitiation`, backdating, chain) |
| `list` | GET | `/hr/site-assignments` | Class guard (hr.view \| leave.view \| leave.create) |
| `listForEmployee` | GET | `/hr/site-assignments/employee/:employeeId` | Class guard |
| `getOne` | GET | `/hr/site-assignments/:id` | Class guard |
| `overtimeImpact` | GET | `/hr/site-assignments/:id/overtime-impact` | Class guard (service adds `hr.view` via `assertHr`) |
| `cancelSubmitted` | POST | `/hr/site-assignments/:id/cancel` | Class guard (service: owner only, SUBMITTED) |
| `cancelApproved` | POST | `/hr/site-assignments/:id/cancel-approved` | Class guard (service adds `hr.view`) |
| `shorten` | POST | `/hr/site-assignments/:id/shorten` | Class guard (service adds `hr.view`) |

**Controller summary:** 1 class, **8** HTTP handlers.

---

## Existing Permission Keys

### Decorator-level (`@RequireAnyPermission`)

| Module | Action | Effective Key | Locations |
|---|---|---|---|
| `hr` | `view` | `hr.view` | [site-assignment.controller.ts:33](../../../src/modules/site-assignment/presentation/controllers/site-assignment.controller.ts#L33) (class) |
| `leave` | `view` | `leave.view` | [site-assignment.controller.ts:34](../../../src/modules/site-assignment/presentation/controllers/site-assignment.controller.ts#L34) (class) |
| `leave` | `create` | `leave.create` | [site-assignment.controller.ts:35](../../../src/modules/site-assignment/presentation/controllers/site-assignment.controller.ts#L35) (class) |

There is **no** `site-assignment` permission module in seeds or decorators.

### Service-level (`hasPermission()` in `site-assignment.service.ts`)

All calls use `module='hr', action='view'` (`hr.view`):

| Context | File:Line |
|---|---|
| `listRequests` — company-wide list vs own records | [site-assignment.service.ts:488](../../../src/modules/site-assignment/application/services/site-assignment.service.ts#L488) |
| `getOvertimeImpact`, `cancelApproved`, `shortenApproved` — `assertHr` | [site-assignment.service.ts:979](../../../src/modules/site-assignment/application/services/site-assignment.service.ts#L979) |
| `assertCanView` — detail / employee profile list | [site-assignment.service.ts:999](../../../src/modules/site-assignment/application/services/site-assignment.service.ts#L999) |

`submitRequest` uses `OnBehalfService.resolveInitiation(..., 'SITE_ASSIGNMENT')` and `BackdatingPolicyService.validateSubmissionDates()` instead of permission keys ([site-assignment.service.ts:252](../../../src/modules/site-assignment/application/services/site-assignment.service.ts), [270](../../../src/modules/site-assignment/application/services/site-assignment.service.ts)).

### Seeds — permission rows

**No dedicated `site-assignment` permission rows** in `backend/prisma/seed.ts` or standalone permission seeders.

- SQL migration creates `site_assignment` table only ([20261005120000_site_assignment/migration.sql](../../../prisma/migrations/20261005120000_site_assignment/migration.sql)).
- Approval category `SITE_ASSIGNMENT` is seed-managed ([approval-categories.seed.ts:124](../../../prisma/seeds/approval-categories.seed.ts#L124)).

Approvals UI permission for category code resolves via `SITE_ASSIGNMENT → leave` in [approval-category-permission.util.ts:11](../../../src/modules/approvals/application/utils/approval-category-permission.util.ts).

---

## Approval Chain

**Category:** `SITE_ASSIGNMENT` — [approval-categories.seed.ts:124](../../../prisma/seeds/approval-categories.seed.ts#L124)

Seed metadata (documentation only — **runtime does not resolve tiers from these rules**):

| Tier | Order | Seed label | Seed resolver | Notes |
|---|---|---|---|---|
| 1 | 1 | Discipline Lead | `DISCIPLINE_LEAD` | Not in `ROLE_ALIASES`; stale vs runtime |

Seed description still says “Employee → Discipline Lead only” ([approval-categories.seed.ts:126-127](../../../prisma/seeds/approval-categories.seed.ts)).

**Runtime chain** (authoritative): `HrApprovalChainService.buildSiteAssignmentApprovalChain()` — [hr-approval-chain.service.ts:496-503](../../../src/modules/hr-shared/application/services/hr-approval-chain.service.ts#L496)

| Subject | Tiers | Resolver | Approver |
|---|---|---|---|
| Typical employee (e.g. Site Engineer) | 1 | `REPORTS_TO` | `User.reportsToUserId` via `getReportsToRequired()` — label **Reports to** |
| GM / Managing Director / System Administrator | 1 | `ROLE:HR Manager` | Active **HR Manager** (never empty chain) |

Confirmed by [hr-approval-chain.site-assignment.spec.ts](../../../src/modules/hr-shared/application/services/hr-approval-chain.site-assignment.spec.ts).

**Not** a separate HR Officer tier for every employee: most requests stop at **Reports to** (direct supervisor). Executives route to **HR Manager** because site assignments must never auto-approve with an empty chain.

Additional runtime rules (still in place):

| Rule | Where |
|---|---|
| **No auto-approve for site assignments** | DTO `autoApproveTier === true` → `BadRequestException` [site-assignment.service.ts:160-163](../../../src/modules/site-assignment/application/services/site-assignment.service.ts#L160); empty resolved chain rejected [311-316](../../../src/modules/site-assignment/application/services/site-assignment.service.ts#L311); `recordOnBehalfCreate` forces `autoApproveTier: false` [415](../../../src/modules/site-assignment/application/services/site-assignment.service.ts#L415); no `applyAutoApprove` call [430](../../../src/modules/site-assignment/application/services/site-assignment.service.ts#L430) |
| **Delegate auto-approve blocked** | `SITE_ASSIGNMENT` ∈ `AUTO_APPROVE_BLOCKED_MODULES` [on-behalf.service.ts:78-79](../../../src/modules/on-behalf/on-behalf.service.ts#L78); `isOnBehalfAutoApproveAllowed('SITE_ASSIGNMENT') === false` |
| **Supervisor on-behalf** | `startChainAboveSubmitter()` when `initiatedAs === SUPERVISOR` [303-308](../../../src/modules/site-assignment/application/services/site-assignment.service.ts#L303) |
| **Backdating / payroll-locked months** | `backdatingPolicy.validateSubmissionDates()` on submit [270-276](../../../src/modules/site-assignment/application/services/site-assignment.service.ts#L270) — `assertNoLockedPayrollMonths` in [backdating-policy.service.ts:125](../../../src/modules/hr-shared/application/services/backdating-policy.service.ts#L125) |
| **OT backfill skips closed payroll** | [scripts/backfill-overtime-site-assignment.ts:11-12,69-79](../../../scripts/backfill-overtime-site-assignment.ts) — skips entries in months with payroll run status APPROVED / GM_APPROVED / PAID |
| **Late approval marks payroll snapshot stale** | On APPROVED + `isLateSubmission`, `markPayrollAttendanceSnapshotStale` per month touched [877-887](../../../src/modules/site-assignment/application/services/site-assignment.service.ts#L877) |

---

## Gaps

### 1. `@DelegatePermissionCheck` on submit (1 handler)

`POST /hr/site-assignments` skips declarative permission evaluation; only authentication is enforced at HTTP layer ([permissions.guard.ts:38-46](../../../src/shared/permissions/permissions.guard.ts), [site-assignment.controller.ts:44](../../../src/modules/site-assignment/presentation/controllers/site-assignment.controller.ts#L44)).

### 2. Handlers reachable with no dedicated permission key at HTTP layer (8)

- **Submit:** auth-only (delegate bypass).
- **Other seven:** class gate satisfied by `leave.create` for all employees; HR-only operations (`cancelApproved`, `shorten`, `overtimeImpact`) rely on service `hr.view` checks.

### 3. No `site-assignment.*` permission module

All access is gated indirectly via `leave.*` / `hr.view` at controller or service layer.

### 4. Class guard uses `leave.view` / `leave.create` for an unrelated HR workflow

Site assignment is not a leave submodule; coupling makes every employee with `leave.create` pass the HTTP gate for list, cancel, and HR endpoints until service checks run.

### 5. HR mutations and reads use `hr.view`, not `hr.edit`

`cancelApproved`, `shorten`, and `overtimeImpact` require `hr.view` only ([assertHr](../../../src/modules/site-assignment/application/services/site-assignment.service.ts#L979)).

### 6. Seed / docs mismatch vs runtime chain

Category seed and description reference **Discipline Lead**; runtime is **Reports to** (and **HR Manager** for executive subjects). `SITE_ASSIGNMENT → leave` in approval-category permission util may confuse New Request / inbox filtering.

### 7. Product note vs runtime for “HR approval for all requests”

Runtime approval for typical employees is **supervisor (Reports to) only**, not an HR Officer/HR Manager tier on every request. HR involvement is mandatory for **executive subjects** (HR Manager tier) and for **HR-only post-approval actions** (cancel approved, shorten). Submission dates in **payroll-locked months** are blocked for everyone via backdating policy.

---

## Proposed Actions

| Gap | Handler(s) | Proposed Action |
|---|---|---|
| `submit` bypasses guard | POST `/hr/site-assignments` | Add declarative key (e.g. `site-assignment.create`); keep `resolveInitiation` / backdating service checks |
| Class guard uses `leave.*` | All GET/POST except submit | Replace with `site-assignment.view` / `create` / `manage` keys aligned to list vs submit vs HR cancel/shorten |
| No permission seed rows | Seeds | Introduce `site-assignment.view`, `site-assignment.create`, `site-assignment.manage` (or similar) with role grant matrix |
| HR cancel/shorten use `hr.view` | cancel-approved, shorten, overtime-impact | Gate on `site-assignment.manage` or `hr.edit` at controller + service |
| Submit `autoApproveTier` / delegate | Service | Document only — rules already enforced; no change unless product wants HTTP-layer key |
| Stale seed category | approval-categories.seed.ts | Update description and tiers to Reports to (+ HR Manager for executives) to match runtime |
| `SITE_ASSIGNMENT → leave` mapping | approval-category-permission.util.ts | Remap to dedicated `site-assignment` module when keys exist |
| Employee list scope | GET list | Keep service split (HR all vs own); align broad list with new view/manage keys instead of `hr.view` |
