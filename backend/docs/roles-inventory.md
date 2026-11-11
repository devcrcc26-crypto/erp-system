# Roles Inventory — pwf_fresh

Generated: 2026-10-19. Read-only audit; no DB or code changes made.

**DB context:** pwf_fresh is a dev/test database with 125 active users.
Only 3–4 roles are populated with users; 0-user counts reflect the dev DB,
not production. The section "User counts" calls this out where relevant.

---

## 1. Role catalogue

All 32 roles have `isSystemRole = true`, `isActive = true`, `parentRoleId = null`.
All were created on **2026-10-07** by the seed admin user (`00000000-0000-4000-8000-000000000001`).
No role has a Chinese name stored in the DB; the Chinese display names are hardcoded in
`frontend/lib/utils/role-colors.ts` (lines 44–75).

| # | Role | Description (DB) | Active users | Only-role users | Also holds Employee |
|---|------|------------------|-------------|-----------------|---------------------|
| 1 | Accountant | Accountant system role | 0 | 0 | 0 |
| 2 | Chief Engineer | Chief Engineer system role | 0 | 0 | 0 |
| 3 | Client Consultant | Client Consultant system role | 0 | 0 | 0 |
| 4 | Department Chief | Department Chief system role | 0 | 0 | 0 |
| 5 | Department Head | Department Head system role | 0 | 0 | 0 |
| 6 | Deputy Chief | Deputy Chief system role | 0 | 0 | 0 |
| 7 | Designer | Designer system role | 0 | 0 | 0 |
| 8 | Discipline Lead | Discipline Lead system role | 0 | 0 | 0 |
| 9 | Discipline Owner | Discipline Owner system role | 0 | 0 | 0 |
| 10 | Dispatcher | Dispatcher system role | 0 | 0 | 0 |
| 11 | Document Controller | Document Controller system role | 0 | 0 | 0 |
| 12 | Employee | Employee system role | **123** | **122** | n/a |
| 13 | Finance Manager | Finance Manager system role | 0 | 0 | 0 |
| 14 | General Manager | General Manager system role | **1** | **1** | 0 |
| 15 | HR Assistant | HR Assistant system role | 0 | 0 | 0 |
| 16 | HR Manager | HR Manager system role | **1** | 0 | **1** |
| 17 | HR Officer | HR Officer system role | 0 | 0 | 0 |
| 18 | HR Specialist | HR Specialist system role | 0 | 0 | 0 |
| 19 | Institute Chief | Institute Chief system role | 0 | 0 | 0 |
| 20 | Local HR Manager | Local HR Manager system role | 0 | 0 | 0 |
| 21 | Managing Director | Managing Director system role | 0 | 0 | 0 |
| 22 | Planning Engineer | Planning Engineer system role | 0 | 0 | 0 |
| 23 | Procurement Officer | Procurement Officer system role | 0 | 0 | 0 |
| 24 | Project Administrator | Project Administrator system role | 0 | 0 | 0 |
| 25 | Project Director | Project Director system role | 0 | 0 | 0 |
| 26 | Project Manager | Project Manager system role | 0 | 0 | 0 |
| 27 | Reviewer | Reviewer system role | 0 | 0 | 0 |
| 28 | Safety Officer | Safety Officer system role | 0 | 0 | 0 |
| 29 | Site Coordinator | Site Coordinator system role | 0 | 0 | 0 |
| 30 | Site Engineer | Site Engineer system role | 0 | 0 | 0 |
| 31 | Storekeeper | Storekeeper system role | 0 | 0 | 0 |
| 32 | System Administrator | System Administrator system role | **1** | **1** | 0 |

---

## 2. Permission counts

153 total `permission` rows in the DB.
A role with 153 rows and mostly `canCreate = true` is full-access.

| Role | Total grant rows | with_create | with_view | Notes |
|------|-----------------|-------------|-----------|-------|
| System Administrator | 153 | 151 | 153 | **Full access** — `isTrueSystemAdministrator()` short-circuits the permission lookup; gets `FULL_PERMISSION_FLAGS` instead of a DB join |
| Project Administrator | **140** | **0** | 140 | View-only across every module; no create grants at all |
| Project Manager | 83 | 71 | 79 | Near-full create |
| General Manager | 83 | 13 | 53 | Broad view, limited create |
| Managing Director | 78 | 64 | 75 | Near-full |
| Discipline Lead | 73 | 8 | 55 | Broad view |
| Project Director | 68 | 58 | 65 | Near-full create |
| HR Manager | 67 | 45 | 67 | Full HR create; approvals reassignment |
| Local HR Manager | 65 | 39 | 65 | Near-HR-Manager |
| Site Engineer | 58 | 13 | 24 | Moderate |
| Employee | 58 | 18 | 58 | Baseline — all HR self-service |
| HR Specialist | 53 | 7 | 53 | Broad view, limited create |
| HR Assistant | 53 | 17 | 53 | Broad view, more create than Specialist |
| Designer | 49 | 10 | 25 | Project-scoped |
| Safety Officer | 44 | 9 | 22 | — |
| Department Chief | 43 | 8 | 25 | ≡ Deputy Chief |
| Deputy Chief | 43 | 8 | 25 | ≡ Department Chief |
| Chief Engineer | 43 | 8 | 22 | — |
| Discipline Owner | 40 | 7 | 25 | ≡ Reviewer |
| Reviewer | 40 | 7 | 25 | ≡ Discipline Owner |
| Site Coordinator | 40 | 9 | 23 | — |
| Document Controller | 39 | 8 | 24 | — |
| Institute Chief | 39 | 7 | 24 | — |
| Dispatcher | 37 | 6 | 22 | — |
| Department Head | 33 | 2 | 33 | Broad view, minimal create |
| Planning Engineer | 34 | 5 | 22 | — |
| HR Officer | 25 | 9 | 25 | Smaller than Specialist/Assistant |
| Client Consultant | 20 | 5 | 14 | — |
| Accountant | 11 | 2 | 10 | ≡ Finance Manager |
| Finance Manager | 11 | 2 | 10 | ≡ Accountant |
| Procurement Officer | 9 | 2 | 9 | ≡ Storekeeper |
| Storekeeper | 9 | 2 | 9 | ≡ Procurement Officer |

### Full-access flags

`isTrueSystemAdministrator()` — returns `true` for `['System Administrator']`.
`isProjectAdministrator()` — returns `true` for `['Project Administrator', 'System Administrator']`.
Neither role is granted full permission via the DB; the code bypasses the DB lookup for System Administrator.

---

## 3. Code references by role name

These break if a role is renamed or removed.

### Backend

| File | Line(s) | Hard-coded role names |
|------|---------|-----------------------|
| `src/shared/constants/protected-accounts.ts` | 12 | `'System Administrator'` |
| `src/shared/permissions/system-admin.util.ts` | 5, 45 | `'Project Administrator'`, `'System Administrator'` |
| `src/shared/permissions/project-admin.util.ts` | 1, 4, 23–24, 43–44 | `'Project Administrator'`, `'System Administrator'`, `'Managing Director'`, `'Project Manager'`, `'Site Coordinator'`, `'Document Controller'` |
| `src/modules/approvals/application/services/approval-resolver.service.ts` | 30–47 | Maps tier resolver codes → 14 role names: `'Project Manager'`, `'HR Officer'`, `'Finance Manager'`, `'Managing Director'`, `'General Manager'`, `'Procurement Officer'`, `'Document Controller'`, `'Safety Officer'`, `'Storekeeper'`, `'Accountant'`, `'Site Engineer'`, `'Employee'` |
| `src/modules/approvals/application/services/approval-reassignment.service.ts` | 19 | `'HR Manager'`, `'System Administrator'` — users with these roles may reassign stuck approvals |
| `src/modules/hr-shared/application/services/hr-approval-chain.service.ts` | 32–98, 211–231, 318–339, 384–697, 854–1139 | `'Discipline Lead'`, `'Department Head'`, `'HR Officer'`, `'HR Manager'`, `'Local HR Manager'`, `'HR Specialist'`, `'HR Assistant'`, `'General Manager'`, `'Managing Director'`, `'System Administrator'` — used in tier-skip arrays, approval routing, and HR chain `if/else` branches |
| `src/modules/auth/application/services/session-capabilities.service.ts` | 40–50, 54 | `'System Administrator'`, `'Managing Director'`, `'Project Manager'`, `'Document Controller'` — control which sidebar capabilities are granted |
| `src/modules/evaluation/application/services/evaluation.service.ts` | 40, 117 | `'HR Manager'`, `'HR Officer'` |
| `src/modules/payroll/application/services/payroll-run.service.ts` | 220–223 | `'HR Manager'`, `'Local HR Manager'`, `'General Manager'`, `'System Administrator'` |
| `src/modules/work-schedule/application/services/work-schedule-cron.service.ts` | 9 | `'HR Officer'` |
| `src/modules/employee-contract/application/services/employee-contract-cron.service.ts` | 10 | `'HR Officer'` |
| `src/modules/business-trip/application/services/business-trip.service.ts` | 1850, 1893 | `'HR Officer'` |
| `src/modules/flight/application/services/flight.service.ts` | 1784, 1827 | `'HR Officer'` (via `findActiveUsersByPrimaryRoleName`) |

### Frontend

| File | Line(s) | Hard-coded role names |
|------|---------|-----------------------|
| `frontend/lib/constants/protected-accounts.ts` | 7 | `'System Administrator'` |
| `frontend/lib/constants/org-roles.ts` | 2 | `'Project Administrator'` |
| `frontend/lib/utils/user-display.ts` | 85–111 | All 31 non-Employee roles — controls display order in user cards |
| `frontend/lib/utils/role-colors.ts` | 6–75 | All 32 roles — color badges + Chinese names |
| `frontend/lib/utils/leave-balance-access.ts` | 3–7 | `'System Administrator'`, `'General Manager'`, `'HR Officer'`, `'HR Manager'`, `'Local HR Manager'` |
| `frontend/hooks/use-auth-capabilities.ts` | 220 | `'HR Manager'` — `isHrManager` capability flag |
| `frontend/components/modules/projects/disciplines/DisciplineDetailPageContent.tsx` | 212 | `'Project Administrator'` |
| `frontend/components/modules/projects/design-packages/DesignPackageDetailPageContent.tsx` | 257 | `'Project Administrator'` |

### Prisma seeds / scripts (run-once, but break if roles renamed)

| File | Roles referenced |
|------|-----------------|
| `prisma/seed-hr-permissions.ts` | `'General Manager'`, `'Managing Director'`, `'HR Officer'`, `'System Administrator'`, `'Employee'`, `'Project Manager'`, `'Project Administrator'` |
| `prisma/seed-employee-contract-permissions.ts` | `'HR Officer'`, `'System Administrator'`, `'Employee'`, `'General Manager'`, `'Managing Director'` |
| `prisma/seed-announcement-permissions.ts` | `'System Administrator'`, `'HR Manager'`, `'Local HR Manager'`, `'HR Specialist'` |
| `prisma/seed-hr-demo.ts` | `'Discipline Lead'`, `'HR Manager'`, `'General Manager'` |
| `prisma/seeds/approval-categories.seed.ts` | `'Department Head'`, `'HR Manager'`, `'Finance Manager'`, `'General Manager'`, `'Discipline Lead'`, `'HR Officer'` — tier labels in category definitions |
| `prisma/scripts/grant-hr-organization-nav.ts` | `'HR Officer'` |
| `prisma/scripts/update-leave-approval-rules.ts` | `'Department Head'`, `'HR Manager'` |

---

## 4. Position-to-role matching

The `position` table stores actual job titles (`position.title`), which are distinct
from role names — they describe what an employee does, not their system access level.

| Verdict | Evidence |
|---------|----------|
| Roles are **NOT** acting as job titles | Actual position titles include Structural Engineer, Architect, Surveyor, Highway Engineer, Driller, Electrical Engineer, etc. — none overlap with role names |
| Only 1 exact match | `Document Controller` — 1 user's position title happens to match the role name |
| Roles describe **authority tier / access level** | Role names like `Discipline Lead`, `Department Head`, `General Manager` are organizational authority levels, not job functions; the position field holds the actual job function |

Roles whose names are close but not matched to positions:

- "Human Resource Manager" (position) vs "HR Manager" (role) — different naming convention
- "Deputy General" (position) vs no matching role
- "Purchase Officer" (position) vs "Procurement Officer" (role)
- "Human Resource Assistant" (position) vs "HR Assistant" (role)

---

## 5. Role groups

### (a) Access / authority roles

These control system capabilities and appear in approval chains. Renaming any of them
requires code changes (see §3).

| Role | Authority level |
|------|----------------|
| System Administrator | Full system access; bypasses permission DB lookup |
| Managing Director | Near-full access; approval chain terminus; session capabilities |
| General Manager | Executive approver; approval chain terminus |
| Project Administrator | View-only on all 140 modules; project data access decisions |
| Project Manager | Near-full create; project authority; session capabilities |
| Project Director | Near-full create; senior project authority |
| HR Manager | HR full create; approval reassignment; payroll; chain routing |
| Local HR Manager | Localized HR Manager equivalent |
| HR Officer | HR process executor; cron jobs; approval tier |
| HR Specialist | HR read + limited create |
| HR Assistant | HR read + limited create |
| Finance Manager | Approval tier for financial requests |
| Department Head | Approval tier (tier 1 in most HR/procurement chains); view-all |
| Discipline Lead | Approval tier (design/project chains); chain routing decision |
| Reviewer | Approval / review context (project modules) |

### (b) Job-title-like roles

These names mirror actual job functions and are typically assigned to match what an employee does.
They still control access tiers, but the name doubles as a job description.

| Role | Grant size | Notes |
|------|-----------|-------|
| Chief Engineer | 43 rows | Technical seniority |
| Institute Chief | 39 rows | Administrative leadership of an institute |
| Department Chief | 43 rows | ≡ Deputy Chief (identical grants) |
| Deputy Chief | 43 rows | ≡ Department Chief (identical grants) |
| Discipline Owner | 40 rows | ≡ Reviewer (identical grants) |
| Designer | 49 rows | Project design work |
| Planning Engineer | 34 rows | — |
| Site Engineer | 58 rows | Onsite engineering |
| Site Coordinator | 40 rows | Onsite coordination |
| Safety Officer | 44 rows | — |
| Procurement Officer | 9 rows | ≡ Storekeeper (identical grants) |
| Accountant | 11 rows | ≡ Finance Manager (identical grants) |
| Storekeeper | 9 rows | ≡ Procurement Officer (identical grants) |
| Dispatcher | 37 rows | Dispatch / project task assignments |
| Document Controller | 39 rows | Document management |
| Client Consultant | 20 rows | External liaison |
| Employee | 58 rows | Baseline access for all staff |

### (c) Likely duplicates (identical grant fingerprints)

These pairs have byte-for-byte identical permission grants. Renaming one or merging
them would not change any user's access.

| Pair | Grant rows each | Risk if merged |
|------|----------------|----------------|
| **Accountant ≡ Finance Manager** | 11 | Both appear in approval tier resolver (`'Accountant'`, `'Finance Manager'`); approval category seed (`'Finance Manager'`); merging requires updating tier label strings |
| **Discipline Owner ≡ Reviewer** | 40 | Both appear in project code (subtask roles, review-tier display, approval chains); names are used differently in UI labels even if grants are the same |
| **Department Chief ≡ Deputy Chief** | 43 | No code hard-codes either name (not in approval chains or seed tier labels) — safest pair to merge |
| **Procurement Officer ≡ Storekeeper** | 9 | Both appear in approval tier resolver (`'Procurement Officer'` → `PROCUREMENT`, `'Storekeeper'` → `STORE`/`WAREHOUSE_MANAGER`); different roles in the supply chain process |

---

## 6. Multi-role users

**Total active users:** 125
**Users with exactly 1 role:** 124 (99.2%)
**Users with exactly 2 roles:** 1 (0.8%)

| # of roles | Users |
|-----------|-------|
| 1 | 124 |
| 2 | 1 |

**Only multi-role combination in DB:**

| Combination | Count |
|-------------|-------|
| Employee + HR Manager | 1 |

> Note: pwf_fresh is a dev DB. Production will have more multi-role users,
> particularly staff who hold both a job-title role (e.g. Site Engineer) and
> a functional role (e.g. Employee). The combination pattern is expected to
> include pairs like `Employee + <specialist role>`.

---

## 7. Approval tier resolution in pwf_fresh

### How resolution works

Approval rules are stored as a **JSON array** in `ApprovalCategory.approvalRules` (no separate rule table).
At submission time, `ApprovalResolverService.resolveRule()` parses this JSON and resolves each tier.
All tiers in pwf_fresh use `resolver: 'ROLE'`.

`resolveRoleApprover()` (`src/modules/approvals/application/services/approval-resolver.service.ts:244`)
queries:
```ts
userRole.findFirst({ where: { roleId, user: { isActive: true, employmentStatus: 'ACTIVE' } } })
```
It does NOT filter by `excludedFromHrProcesses`. It picks the oldest `user_role` row.

### Critical alias mapping

`ROLE_ALIASES` in `approval-resolver.service.ts:29–48` maps tier `role` codes:

| Code in rule | Resolved system role | UI label in tiers |
|---|---|---|
| `DEPARTMENT_HEAD` | **Project Manager** | "Department Head" |
| `HR_MANAGER` | **HR Officer** | "HR Manager" |
| `FINANCE_MANAGER` | Finance Manager | "Finance Manager" |
| `GENERAL_MANAGER` | General Manager | "General Manager" |
| `DISCIPLINE_LEAD` | Discipline Lead | "Discipline Lead" |
| `ADMIN_MANAGER` | Document Controller | "Admin Manager" |
| `WAREHOUSE_MANAGER` | Storekeeper | "Warehouse Manager" |
| `PROJECT_MANAGER` | Project Manager | "Project Manager" |
| `HR` | HR Officer | "HR Officer" |

**The `DEPARTMENT_HEAD` → `Project Manager` alias means any tier labelled "Department Head"
actually finds a user with the 'Project Manager' system role, not 'Department Head'.**
Similarly `HR_MANAGER` → `HR Officer` (not 'HR Manager').

### Tier-by-tier status in pwf_fresh

Active users per resolved role (as seen by the resolver — `excludedFromHrProcesses` not filtered):

| Resolved role | Active users |
|---|---|
| Project Manager (DEPARTMENT_HEAD) | **0** |
| HR Officer (HR / HR_MANAGER) | **0** |
| Finance Manager | **0** |
| General Manager | **1** |
| Discipline Lead (DISCIPLINE_LEAD) | **0** |
| Document Controller (ADMIN_MANAGER) | **0** |
| Storekeeper (WAREHOUSE_MANAGER) | **0** |
| HR Manager | **1** (only appears if rule uses `'HR Manager'` literally, not the alias) |

| Category | Rule | Tier | Role code → resolved role | Users | Outcome |
|---|---|---|---|---|---|
| BUSINESS_TRIP | _none_ | — | — | — | **FAILS: no rules configured** |
| CONSUMABLES_REQUISITION | Default | T1: Dept Head | DEPARTMENT_HEAD → Project Manager | 0 | **FAILS: vacant** |
| EXIT_PERMIT | Default | T1: Dept Head | DEPARTMENT_HEAD → Project Manager | 0 | **FAILS: vacant** |
| EXIT_PERMIT | Default | T2: HR Officer | HR → HR Officer | 0 | **FAILS: vacant** |
| EXPENSE_CLAIM | Low ≤5k | T1: Dept Head | DEPARTMENT_HEAD → Project Manager | 0 | **FAILS: vacant** |
| EXPENSE_CLAIM | High >5k | T1: Dept Head | DEPARTMENT_HEAD → Project Manager | 0 | **FAILS: vacant** |
| EXPENSE_CLAIM | High >5k | T2: Finance Mgr | FINANCE_MANAGER → Finance Manager | 0 | **FAILS: vacant** |
| EXPENSE_CLAIM | High >5k | T3: General Mgr | GENERAL_MANAGER → General Manager | 1 | resolves |
| FIELD_MOVEMENT_LOG | Default | T1: Dept Head | DEPARTMENT_HEAD → Project Manager | 0 | **FAILS: vacant** |
| FIELD_MOVEMENT_LOG | Default | T2: HR Officer | HR → HR Officer | 0 | **FAILS: vacant** |
| FLIGHT_APPLICATION | Default | T1: Dept Head | DEPARTMENT_HEAD → Project Manager | 0 | **FAILS: vacant** |
| FLIGHT_APPLICATION | Default | T2: HR Manager | HR_MANAGER → HR Officer | 0 | **FAILS: vacant** |
| FLIGHT_APPLICATION | Default | T3: General Mgr | GENERAL_MANAGER → General Manager | 1 | resolves |
| INSPECTION_REPAIR | Low ≤5k | T1: Dept Head | DEPARTMENT_HEAD → Project Manager | 0 | **FAILS: vacant** |
| INSPECTION_REPAIR | High >5k | T2: Finance Mgr | FINANCE_MANAGER → Finance Manager | 0 | **FAILS: vacant** |
| INSPECTION_REPAIR | High >5k | T3: General Mgr | GENERAL_MANAGER → General Manager | 1 | resolves |
| LEAVE_REQUEST | Default | T1: Dept Head | DEPARTMENT_HEAD → Project Manager | 0 | **FAILS: vacant** |
| LEAVE_REQUEST | Default | T2: HR Manager | HR_MANAGER → HR Officer | 0 | **FAILS: vacant** |
| MATERIAL_REQUISITION | Default | T1: Dept Head | DEPARTMENT_HEAD → Project Manager | 0 | **FAILS: vacant** |
| MATERIAL_REQUISITION | Default | T2: Warehouse Mgr | WAREHOUSE_MANAGER → Storekeeper | 0 | **FAILS: vacant** |
| OFFICIAL_SEAL_USAGE | Default | T1: Dept Head | DEPARTMENT_HEAD → Project Manager | 0 | **FAILS: vacant** |
| OFFICIAL_SEAL_USAGE | Default | T2: General Mgr | GENERAL_MANAGER → General Manager | 1 | resolves |
| OVERTIME_APPLICATION | Short ≤4h | T1: Dept Head | DEPARTMENT_HEAD → Project Manager | 0 | **FAILS: vacant** |
| OVERTIME_APPLICATION | Extended >4h | T2: HR Manager | HR_MANAGER → HR Officer | 0 | **FAILS: vacant** |
| PAYROLL_RUN | Default | T1: HR Manager | HR → HR Officer | 0 | **FAILS: vacant** |
| PAYROLL_RUN | Default | T2: General Mgr | GENERAL_MANAGER → General Manager | 1 | resolves |
| PER_DIEM | Default | T1: Discipline Lead | DISCIPLINE_LEAD → Discipline Lead | 0 | **FAILS: vacant** |
| PER_DIEM_SETTLEMENT | Default | T1: HR Manager | HR_MANAGER → HR Officer | 0 | **FAILS: vacant** |
| PROJECT_SEAL_USAGE | Default | T1: Project Mgr | PROJECT_MANAGER → Project Manager | 0 | **FAILS: vacant** |
| PROJECT_SEAL_USAGE | Default | T2: General Mgr | GENERAL_MANAGER → General Manager | 1 | resolves |
| PURCHASE_REQUEST | Standard ≤10k | T2: Finance Mgr | FINANCE_MANAGER → Finance Manager | 0 | **FAILS: vacant** |
| PURCHASE_REQUEST | High >10k | T3: General Mgr | GENERAL_MANAGER → General Manager | 1 | resolves |
| SITE_ASSIGNMENT | Default | T1: Discipline Lead | DISCIPLINE_LEAD → Discipline Lead | 0 | **FAILS: vacant** |
| VEHICLE_APPLICATION | Default | T1: Dept Head | DEPARTMENT_HEAD → Project Manager | 0 | **FAILS: vacant** |
| VEHICLE_APPLICATION | Default | T2: Admin Mgr | ADMIN_MANAGER → Document Controller | 0 | **FAILS: vacant** |
| VEHICLE_REFUELING | Default | T1: Admin Mgr | ADMIN_MANAGER → Document Controller | 0 | **FAILS: vacant** |
| WORK_FROM_HOME | Default | T1: Discipline Lead | DISCIPLINE_LEAD → Discipline Lead | 0 | **FAILS: vacant** |

### What happens at 0 users

`resolveRoleApprover()` throws:
```ts
throw new BadRequestException(vacantApproverMessage(roleKey ?? tier.label));
// → "Approver position vacant: <role> - ask HR"
```
`approval-resolver.service.ts:282`

This is thrown **at submission time** — the request is rejected with HTTP 400 before any tier record is created. Requests do not get stuck; they fail immediately. The form shows the `BadRequestException` message.

The `DEPARTMENT_LEADER` resolver path (`approval-resolver.service.ts:217`) similarly throws
`BadRequestException('Cannot resolve department leader for tier "..."')` when
`department.leaderUserId` is null. In pwf_fresh all 12 departments have `leaderUserId = NULL`.

### HrApprovalChainService auto-approve

Some categories use `HrApprovalChainService` instead of the JSON rules (leave, overtime, business trip,
flight, per diem, etc.). When the submitter's role is in `AUTO_APPROVE_ROLES`
(`hr-approval-chain.service.ts:70`):
```ts
export const AUTO_APPROVE_ROLES = ['General Manager', 'Managing Director', 'System Administrator'];
```
the chain builder skips lower tiers and auto-approves the request. If chain resolution fails
entirely, the builder can wrap it in an `AUTO_APPROVE_FALLBACK` tier (`hr-approval-chain.service.ts:164–177`).
This fallback is the only mechanism that prevents a hard failure when all resolvers return empty.

---

## 8. Department leader and Discipline leader: two parallel mechanisms

The codebase has two separate ways to resolve a "Department Head" or "Discipline Lead" approver.
Both exist and are used in different code paths for the same logical purpose.

### Mechanism A — Direct leader fields (person-centric)

| Field | Table | Prisma path | Used in |
|---|---|---|---|
| `department.leader_user_id` | `department` | `user.department.leaderUser` | `approval-resolver.service.ts:217` (DEPARTMENT_LEADER resolver), `hr-approval-chain.service.ts:1567–1585` |
| `engineering_discipline.leader_id` | `engineering_discipline` | `user.engineeringDiscipline.leader` | `hr-approval-chain.service.ts:1469–1479`, `evaluation.service.ts:477`, `on-behalf.service.ts:144` |
| `department.leaderUserId` | `department` | session capabilities | `session-capabilities.service.ts:195` — surfaces `navDepartmentLeader` flag to frontend |

In pwf_fresh: 12 departments — all `leaderUserId = NULL`. 18 disciplines — all `leaderId = NULL`.
Every `DEPARTMENT_LEADER` resolver call would throw today.

### Mechanism B — Role-based lookup (role-centric)

`findActiveUsersByPrimaryRoleName(companyId, 'General Manager')` — queries any active user with that role.
Used in `hr-process-exclusion.spec.ts:386`, `business-trip.service.ts:1848`, `flight.service.ts:1784`.

The `ROLE` resolver with `DEPARTMENT_HEAD` alias → `Project Manager` is also role-based
(any Project Manager in the company fills the Department Head tier).

### Where both exist for the same purpose

`hr-approval-chain.service.ts` uses **both** for discipline lead resolution:
- Line 1469: `employee.engineeringDiscipline.leader` (mechanism A)
- Lines 1567–1585: `employee.department.leaderUser` (mechanism A for dept)
- Lines 32–98, 211–231: role-name arrays that skip tiers if the submitter already holds one of those roles (mechanism B used as a gate, not a lookup)

For `HrApprovalChainService`, the discipline lead tier always resolves via the `leader_id` field
(mechanism A), never by querying everyone with the 'Discipline Lead' role.
For the generic `ApprovalResolverService`, all tiers use role queries (mechanism B).
There is no point where the same tier does both; the mechanisms are on separate code paths.

---

## 9. Project-scoped roles (ProjectTeam)

### Model

`ProjectTeam` (table: `project_team`, `prisma/schema.prisma:2142`):
- `roleOnProject String?` — stores the `ProjectTeamRole` enum value as a string
- `visibleModules String[]` — per-project module visibility (not related to global roles)
- One row per user per project; unique on `(projectId, userId)`

### ProjectTeamRole enum values

`src/modules/project-management/domain/contracts/enums/project-team-role.enum.ts`:

| Enum value | Display label | Matching global system role |
|---|---|---|
| `PROJECT_MANAGER` | Project Manager | **exact match** — 'Project Manager' |
| `DISPATCHER` | Dispatcher | **exact match** — 'Dispatcher' |
| `SITE_COORDINATOR` | Site Coordinator | **exact match** — 'Site Coordinator' |
| `DEPARTMENT_CHIEF` | Department Chief | **exact match** — 'Department Chief' |
| `INSTITUTE_CHIEF` | Institute Chief | **exact match** — 'Institute Chief' |
| `DEPUTY_CHIEF` | Deputy Chief | **exact match** — 'Deputy Chief' |
| `DOCUMENT_CONTROLLER` | Document Controller | **exact match** — 'Document Controller' |
| `OTHER` | Other | — |

### Do they duplicate global roles?

**By name — yes.** All 7 named `ProjectTeamRole` values correspond exactly to global system role names.

**By function — no.** `ProjectTeam.roleOnProject` is a per-project assignment: it records which
project-level function the user fills within a specific project (e.g. they are the Dispatcher
on Project X). This is independent of their global system role:
- A user with global 'Site Engineer' role can be `PROJECT_MANAGER` on a project
- A user with global 'Project Manager' role is NOT automatically a team member of any project

The project membership controls per-project visibility (`visibleModules`) and access decisions
(e.g. `DisciplineDetailPageContent.tsx:212` checks `role.name === 'Project Administrator'` from
the user's **global** roles, not from `ProjectTeam`).

**Discipline sub-roles** (Designer, Reviewer, Discipline Owner) are assigned via separate
`Discipline` model fields (`designerId`, `reviewerId`, `leaderId`, etc.) — not via `ProjectTeam`.
The `project-team-role.enum.ts` values do not include Designer, Reviewer, or Discipline Owner.

In pwf_fresh: `project_team` table has no rows (empty or freshly seeded project data).

---

## 10. Other configured databases

| Database | Source | Status | Role counts |
|---|---|---|---|
| `pwf_fresh` — `localhost:5433` | `backend/.env` (active `DATABASE_URL`) | Active — all data in this report | see §1 |
| `pwf_test` — `localhost:5433` | `backend/.env` lines 13–14 (commented out) | Not connected; local test DB | not queried |
| Supabase — `postgres.sqirbwhvtuvtngzpjlfg.aws-0-eu-west-1.pooler.supabase.com` | `backend/.env.supabase-backup` (active), `backend/.env.test`, `backend/.env` lines 4–10 (commented) | Likely production or staging; credentials present in repo files | **not queried — may be live production data** |

The Supabase instance has its password stored in plaintext in `.env.supabase-backup` and `.env.test`.
These files are not in `.gitignore` (not verified); if committed, the credentials are exposed.
