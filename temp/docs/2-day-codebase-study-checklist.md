# 2-Day Full-Stack Codebase Study Checklist

**Construction ERP monorepo** (`backend/` + `frontend/`)

~18 focused hours (9h/day + breaks). Goal: know where everything lives and trace any feature end-to-end.

Keep a running notes doc with 4 sections: **Routes**, **Entities**, **Flows traced**, **Open questions**.

---

## Before you start (30 min)

- [ ] Read `.cursorrules` (architecture rules - treat as law)
- [ ] Skim `.env.example`, `docker-compose.yml`
- [ ] Copy env files: `backend/.env.example` → `backend/.env`, `frontend/.env.example` → `frontend/.env.local`
- [ ] Start infra: `docker compose up -d postgres redis minio`
- [ ] Backend: `cd backend && npx prisma migrate deploy && npx prisma db seed`
- [ ] Run: backend `:3001`, frontend `:3000`
- [ ] Open Swagger: `http://localhost:3001/api/docs`
- [ ] Log in with users from `frontend/lib/constants/demo-login-credentials.ts`

**Checkpoint:** Can you load `/projects` and open one project?

---



# DAY 1 - Platform skeleton



## Hour 1 - Monorepo map [Both]

**Goal:** Know the folder layout.


| Read (in order)                       | Why                            |
| ------------------------------------- | ------------------------------ |
| `package.json` (repo root)            | Turborepo scripts              |
| `backend/package.json`                | NestJS entry, test scripts     |
| `frontend/package.json`               | Next.js scripts                |
| `backend/src/app.module.ts`           | All backend modules registered |
| `frontend/app/(dashboard)/layout.tsx` | Dashboard shell wrapper        |


**Exercise:** List backend modules from `app.module.ts`:
`auth`, `company-setup`, `user-management`, `audit`, `notifications`, `documents`, `project-management`, `reporting`

**Checkpoint:** Where does the frontend dashboard get wrapped in `AppShell`?

---



## Hour 2 - Frontend routing [FE]

**Goal:** Page → component mapping.


| Read                                               | Why                                         |
| -------------------------------------------------- | ------------------------------------------- |
| `frontend/components/ui/shell/AppShell.tsx`        | 3-pane layout                               |
| `frontend/config/navConfig.ts`                     | Route meta, breadcrumbs, `extractProjectId` |
| `frontend/lib/navigation/project-workspace-nav.ts` | Inner project sidebar items                 |
| `frontend/components/ui/shell/ContextSidebar.tsx`  | Sidebar renderer                            |


**Exercise:** Pick **Disciplines** nav item:

1. `pathSuffix: 'disciplines'` in `project-workspace-nav.ts`
2. Page: `frontend/app/(dashboard)/projects/[projectId]/disciplines/page.tsx`
3. Find which `*PageContent.tsx` it imports

Repeat mentally for:

- `review-inbox` → `frontend/app/(dashboard)/projects/[projectId]/review-inbox/page.tsx`
- `my-work` → `frontend/app/(dashboard)/projects/[projectId]/my-work/page.tsx`
- Subtask detail → `frontend/app/(dashboard)/projects/[projectId]/disciplines/[taskDisciplineId]/packages/[packageId]/page.tsx`

**Checkpoint:** Draw: `URL → app/page.tsx → PageContent → query hook`

---



## Hour 3 - API client & server state [FE]

**Goal:** How the browser talks to the API.


| Read                                   | Why                              |
| -------------------------------------- | -------------------------------- |
| `frontend/lib/api/client.ts`           | Axios, interceptors, 401 refresh |
| `frontend/stores/auth.store.ts`        | JWT in Zustand                   |
| `frontend/lib/query/auth.ts`           | Login/logout mutations           |
| `frontend/lib/query/projects.ts`       | Typical query pattern            |
| `frontend/lib/query/pm-query-utils.ts` | Shared PM query keys/helpers     |


**Exercise:** In DevTools Network, open a project page. Find:

- Request URL pattern
- `Authorization: Bearer` header
- Response envelope `{ success, data, meta? }`

**Checkpoint:** Where is the access token attached to requests?

---



## Hour 4 - Auth backend [BE]

**Goal:** Login → JWT → guards.


| Read                                                                   | Why                                      |
| ---------------------------------------------------------------------- | ---------------------------------------- |
| `backend/src/modules/auth/presentation/controllers/auth.controller.ts` | Login, refresh, logout                   |
| `backend/src/modules/auth/application/services/token.service.ts`       | Token creation                           |
| `backend/src/shared/guards/jwt-auth.guard.ts`                          | Global auth guard                        |
| `backend/src/shared/permissions/require-permission.decorator.ts`       | `@RequirePermission('schedule', 'view')` |
| `backend/src/shared/permissions/permissions.module.ts`                 | Permission resolution                    |


**Exercise:** Find login handler → where refresh token is hashed → which table stores sessions (`UserSession` in schema)

**Checkpoint:** What happens on a 403 vs 401?

---



## Hour 5 - RBAC & capabilities [Both]

**Goal:** Why a user can see inbox but not review mode (common bug class).


| Read                                                                                         | Why                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `backend/prisma/seed.ts`                                                                     | Role → permission grants (search `EPC_WORKFLOW_ROLES`) |
| `backend/src/modules/project-management/application/services/permission-resolver.service.ts` | Project-scoped grants                                  |
| `frontend/hooks/use-pm-capabilities.ts`                                                      | `canView`, `canEdit`, `canApprove` per module          |
| `frontend/hooks/use-pm-capabilities.ts` → `useEpcCapabilities`                               | EPC-specific probes                                    |
| `frontend/lib/navigation/project-nav-visibility.ts`                                          | Nav item visibility rules                              |
| `frontend/components/modules/projects/workspaces/RoleLensProvider.tsx`                       | Per-project role lens                                  |


**Exercise:** Log in as **Institute Chief** (Li Zhang). List which of `schedule.view`, `design_packages.view`, `review_sessions.approve` they have.

**Checkpoint:** What is the difference between global role permissions and project role lens?

---



## Hour 6 - Database schema (EPC core) [BE]

**Goal:** Entity relationships - don't read every field.


| Read in `backend/prisma/schema.prisma`              | Focus               |
| --------------------------------------------------- | ------------------- |
| `Company`, `User`, `Role`, `Permission`             | Tenancy + RBAC      |
| `Project`, `Task`, `TaskDiscipline`                 | Schedule hierarchy  |
| `DesignPackage`, `DesignPackageItem`                | Subtask + EDV links |
| `EngineeringDocument`, `EngineeringDocumentVersion` | EDVs                |
| `ReviewSession`, `ReviewComment`                    | Governance          |
| `AuditLog`                                          | Immutable audit     |


**Exercise:** Draw ERD on paper:

```
Project → Task → TaskDiscipline → DesignPackage
                                      ↓
                              DesignPackageItem → EDV
DesignPackage → ReviewSession → ReviewComment
```

**Checkpoint:** What columns exist on every user-facing table? (`company_id`, `deleted_at`, audit fields)

---



## Hour 7 - Backend layering [BE]

**Goal:** Clean architecture boundaries.


| Read                                                                                            | Why                 |
| ----------------------------------------------------------------------------------------------- | ------------------- |
| `backend/src/modules/project-management/project-management.module.ts`                           | Module wiring       |
| `backend/src/modules/project-management/presentation/controllers/design-packages.controller.ts` | Thin controller     |
| `backend/src/modules/project-management/application/services/design-packages.service.ts`        | Orchestration       |
| `backend/src/modules/project-management/infrastructure/repositories/` (pick one)                | Prisma only here    |
| `backend/src/modules/project-management/domain/` (skim folder list)                             | Pure business logic |


**Exercise:** Pick `POST .../lock-edvs` in `design-packages.controller.ts`. Trace:
`controller → design-packages.service.lockPackageEdvs → workflow-kernel.service`

**Checkpoint:** Where is Prisma **not** allowed to be called?

---



## Hour 8 - Shared infrastructure [BE]

**Goal:** Cross-cutting concerns.


| Read                                                                       | Why                                    |
| -------------------------------------------------------------------------- | -------------------------------------- |
| `backend/src/shared/filters/http-exception.filter.ts`                      | Error envelope                         |
| `backend/src/shared/interceptors/response-envelope.interceptor.ts`         | `{ success, data }`                    |
| `backend/src/shared/prisma/`                                               | Prisma client + soft-delete middleware |
| `backend/src/shared/storage/`                                              | MinIO/S3 abstraction                   |
| `backend/src/modules/audit/presentation/interceptors/audit.interceptor.ts` | CUD audit logging                      |


**Checkpoint:** How does soft delete work? (search `deleted_at` middleware)

---



## Hour 9 - Day 1 synthesis [Both]

**Goal:** Trace one complete vertical slice.

**Exercise - Disciplines list:**

```
ContextSidebar "Disciplines"
  → frontend/app/(dashboard)/projects/[projectId]/disciplines/page.tsx
  → DisciplinesPageContent.tsx
  → frontend/lib/query/disciplines.ts or schedule.ts
  → GET /api/projects/:id/...
  → schedule.controller.ts or projects controller
  → *.service.ts
  → prisma repository
```

Write the chain in your notes with **exact file paths**.

**End of Day 1 checkpoint:**

- [ ] I can find any project page from nav config
- [ ] I understand auth + permissions pipeline
- [ ] I know the 8 core EPC tables
- [ ] I traced one feature end-to-end

---



# DAY 2 - EPC workflow (the heart)



## Hour 10 - Domain language [Both]

**Goal:** Status enums and role vocabulary.


| Read                                                                              | Why                                     |
| --------------------------------------------------------------------------------- | --------------------------------------- |
| `frontend/lib/api/epc.types.ts`                                                   | Frontend domain types                   |
| `backend/src/modules/project-management/domain/contracts/enums/` (skim all files) | Backend enums                           |
| `frontend/lib/utils/subtask-role-resolver.ts`                                     | Designer vs reviewer vs discipline lead |
| `frontend/lib/hooks/use-package-role-lens.ts`                                     | UI action flags per package             |
| `frontend/lib/utils/review-governance.ts`                                         | Review tiers, batch approve rules       |
| `ERD files/workflow.md`                                                           | Business workflow doc                   |


**Exercise:** Write definitions for:
`DRAFT`, `IN_REVIEW`, `APPROVED`, `LOCKED`, `projectedStatus`, `packageStatus`, `SUBMITTED`, `OPEN`, `CLOSED`

**Checkpoint:** Who is `disciplineLeadUserId` vs `disciplinaryLeaderUserId`?

---



## Hour 11 - Flow A: Designer submits [Both]

**Goal:** Submit for review path.


| Layer       | File                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| UI          | `frontend/components/modules/projects/design-packages/DesignPackageDetailPageContent.tsx`                            |
| Eligibility | `frontend/lib/utils/package-workflow.ts` (`getPackageSubmitEligibility`)                                             |
| Hook        | `frontend/lib/query/design-packages.ts` (`useSubmitPackageForReview`)                                                |
| API         | `backend/src/modules/project-management/presentation/controllers/design-packages.controller.ts`                      |
| Service     | `backend/src/modules/project-management/application/services/design-packages.service.ts`                             |
| Kernel      | `backend/src/modules/project-management/application/services/workflow-kernel.service.ts`                             |
| Projection  | `backend/src/modules/project-management/application/services/state-projection.service.ts` (search `projectedStatus`) |


**Exercise:** Log in as **Designer** (Wei Chen). Open a subtask. Find **Submit for review** and trace the API call in Network tab.

**Checkpoint:** What EDV statuses are required before submit?

---



## Hour 12 - Flow B: Review mode [Both]

**Goal:** Governance review path.


| Layer       | File                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------- |
| Page        | `frontend/app/(dashboard)/projects/[projectId]/review-inbox/page.tsx`                         |
| Inbox UI    | `frontend/components/modules/projects/review/ReviewInboxTable.tsx`                            |
| Review page | `frontend/app/(dashboard)/design-packages/[packageId]/review/page.tsx`                        |
| Panel       | `frontend/components/modules/projects/review/ReviewModePanel.tsx`                             |
| Governance  | `frontend/components/modules/projects/review/DisciplineLeadConsole.tsx`                       |
| Hook        | `frontend/lib/query/epc-workspace.ts` (`useDesignPackageReviewMode`)                          |
| API         | `backend/src/modules/project-management/presentation/controllers/epc-workspace.controller.ts` |
| Service     | `backend/src/modules/project-management/application/services/review-workflow.service.ts`      |


**Exercise:** Trace **Approve & escalate** from button click → `approveSession.mutateAsync` → backend handler.

**Checkpoint:** What is `currentTier`? When is final tier "Approve - close package"?

---



## Hour 13 - Flow C: Approve EDVs + comments [Both]

**Goal:** Document-level approval and comment blocking.


| Read                                                                                            | Why                       |
| ----------------------------------------------------------------------------------------------- | ------------------------- |
| `frontend/lib/utils/comment-workflow.ts`                                                        | `canApproveReviewSession` |
| `frontend/components/modules/projects/review/ReviewApprovalBlockedAlert.tsx`                    | Blocking UI               |
| `backend/src/modules/project-management/presentation/controllers/review-comments.controller.ts` | Comment CRUD              |
| `backend/src/modules/project-management/domain/comment-state-machine.ts`                        | Comment statuses          |
| `backend/src/modules/project-management/presentation/controllers/review-batch.controller.ts`    | Batch approve EDVs        |


**Exercise:** What comment statuses block approval? (`OPEN`, `IN_PROGRESS`, etc.)

**Checkpoint:** When does "Approve all EDVs" appear vs per-document approve?

---



## Hour 14 - Flow D: Lock + close [Both]

**Goal:** Post-review package closure.


| Layer            | File                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Lock UI          | `frontend/components/modules/projects/design-packages/DesignPackageDetailPageContent.tsx` (lines ~389–406)            |
| Lock eligibility | `frontend/lib/utils/package-workflow.ts` (`getPackageLockGuidance`)                                                   |
| Close UI         | `DesignPackageDetailPageContent.tsx` (`canClosePackage`)                                                              |
| Hooks            | `frontend/lib/query/design-packages.ts` (`useLockPackageEdvs`, `useCloseDesignPackage`)                               |
| API lock         | `design-packages.controller.ts` `@Post(':packageId/lock-edvs')`                                                       |
| API close        | `design-packages.controller.ts` `@Post(':packageId/close')`                                                           |
| Guards           | `backend/src/modules/project-management/application/services/conflict-guard.service.ts` (`assertPackageLockEligible`) |
| Kernel lock      | `workflow-kernel.service.ts` (`executeLockPackageEdvs`)                                                               |


**Exercise:** Document the gap: who can lock in UI vs who can lock via API permission (`schedule.view`).

**Checkpoint:** What 3 conditions gate **Close Package**?

---



## Hour 15 - My Work & role routing [FE]

**Goal:** How users land on the right workspace.


| Read                                                                             | Why                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------ |
| `frontend/app/(dashboard)/projects/[projectId]/my-work/page.tsx`                 | Entry                                            |
| `frontend/components/modules/projects/workspaces/MyWorkPageContent.tsx`          | Role-based links                                 |
| `frontend/lib/utils/schedule-subtasks.ts`                                        | `scheduleSubtaskWorkspaceHref`, `reviewModeHref` |
| `backend/src/modules/project-management/application/services/my-work.service.ts` | Backend inbox items                              |


**Exercise:** For each role type in My Work (`DISCIPLINE_LEAD`, `SUBTASK_ROLE`), where does the link go?

**Checkpoint:** Why does reviewer go to review mode only when `packageStatus === 'SUBMITTED'`?

---



## Hour 16 - Workflow kernel & state machine [BE]

**Goal:** How writes actually happen.


| Read                                                                                            | Why                    |
| ----------------------------------------------------------------------------------------------- | ---------------------- |
| `backend/src/modules/project-management/application/services/workflow-kernel.service.ts`        | All workflow commands  |
| `backend/src/modules/project-management/domain/contracts/workflow-kernel.contract.ts`           | Command types          |
| `backend/src/modules/project-management/application/services/edv-transition.service.ts`         | EDV status transitions |
| `backend/src/modules/project-management/infrastructure/repositories/epc-workflow.repository.ts` | Package + EDV loads    |


**Exercise:** List workflow command types: `SubmitPackageForReview`, `LockPackageEdvs`, `ApproveReviewSession`, etc.

**Checkpoint:** What must be true before `LockPackageEdvs` runs?

---



## Hour 17 - Tests as docs [BE]

**Goal:** Business rules without reading all services.

Skim (read test names + key assertions only):


| File                                                                                                                     | Teaches                        |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `backend/src/modules/project-management/domain/approval-chain.util.spec.ts`                                              | Approval chain resolution      |
| `backend/src/modules/project-management/application/services/__tests__/closure-chain.service.spec.ts`                    | Close discipline/package rules |
| `backend/src/modules/project-management/application/services/__tests__/state-projection-locked.service.spec.ts`          | When status becomes LOCKED     |
| `backend/src/modules/project-management/application/services/__tests__/permission-resolver-review-grant.service.spec.ts` | Review permissions             |
| `frontend/e2e/epc-review-workflow.spec.ts`                                                                               | Full UI flow                   |


**Exercise:** Pick 3 test names. For each, write one sentence: "This test proves that ___"

---



## Hour 18 - Final synthesis [Both]

**Goal:** Prove you understand the system.

### Exercise 1 - Blind trace (30 min)

Pick a feature you haven't traced: **Submittals**

```
frontend/app/(dashboard)/projects/[projectId]/submittals/page.tsx
  → SubmittalsPageContent.tsx
  → frontend/lib/query/submittals.ts
  → backend/src/modules/project-management/presentation/controllers/submittals.controller.ts
  → submittals.service.ts
```



### Exercise 2 - Explain to a colleague (20 min)

Explain aloud (or write):

1. Subtask lifecycle from create → submit → review → lock → close
2. Who can do each step
3. Where permissions are enforced (API vs UI)



### Exercise 3 - Gap list (10 min)

Write 5 things you still don't know. Example:

- How submittal packages bundle locked EDVs
- How financial periods interact with PM
- Where document storage paths are built

---



## Quick reference card



### Frontend layers

```
app/(dashboard)/.../page.tsx          → route entry (thin)
components/modules/projects/...       → page logic
lib/query/*.ts                        → TanStack Query hooks
lib/api/client.ts                     → HTTP
stores/*.store.ts                     → client-only state (auth, UI)
```



### Backend layers

```
presentation/controllers/*.ts         → HTTP + DTO validation
application/services/*.ts             → use cases
application/dtos/*.ts                 → input/output shapes
infrastructure/repositories/*.ts      → Prisma
domain/*.ts                           → pure logic
```



### Key EPC files (bookmark these)


| Topic             | Path                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Inner sidebar nav | `frontend/lib/navigation/project-workspace-nav.ts`                                              |
| Subtask detail    | `frontend/components/modules/projects/design-packages/DesignPackageDetailPageContent.tsx`       |
| Review mode       | `frontend/components/modules/projects/review/ReviewModePanel.tsx`                               |
| Package API       | `backend/src/modules/project-management/presentation/controllers/design-packages.controller.ts` |
| Review logic      | `backend/src/modules/project-management/application/services/review-workflow.service.ts`        |
| Workflow writes   | `backend/src/modules/project-management/application/services/workflow-kernel.service.ts`        |
| Permissions       | `backend/src/modules/project-management/application/services/permission-resolver.service.ts`    |
| Schema            | `backend/prisma/schema.prisma`                                                                  |




### All project workspace routes


| Nav key        | Page path                                                                           |
| -------------- | ----------------------------------------------------------------------------------- |
| dashboard      | `projects/[projectId]/page.tsx`                                                     |
| disciplines    | `projects/[projectId]/disciplines/page.tsx`                                         |
| schedule       | `projects/[projectId]/schedule/page.tsx`                                            |
| review-inbox   | `projects/[projectId]/review-inbox/page.tsx`                                        |
| my-work        | `projects/[projectId]/my-work/page.tsx`                                             |
| submittals     | `projects/[projectId]/submittals/page.tsx`                                          |
| subtask detail | `projects/[projectId]/disciplines/[taskDisciplineId]/packages/[packageId]/page.tsx` |


---



## Role shortcuts

**Frontend-heavy:** Skip Hours 8, 16 depth; spend extra on Hours 2, 3, 11–15.

**Backend-heavy:** Skip Hour 2 UI polish; spend extra on Hours 6–8, 16–17.

**Nav/shell/EPC focus:** Prioritize Hours 2, 5, 10–15.

---



## Success criteria after 2 days

You pass if you can do these **without searching blindly**:

1. Add a nav item to the inner project sidebar (know 3 files to touch)
2. Trace a button click to a Prisma query
3. Explain why a user sees 403 on one page but not another
4. Describe subtask status flow and who locks/closes
5. Find any project page from URL alone

---



## Related docs

- `docs/core-foundation-and-pm-learning-guide.md` - deep-dive learning guide
- `docs/epc-operating-model.md` - EPC business model
- `ERD files/workflow.md` - workflow diagram
- `.cursorrules` - architecture rules

