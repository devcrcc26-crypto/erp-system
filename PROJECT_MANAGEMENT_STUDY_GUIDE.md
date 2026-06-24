# Project Management Module - Developer Study Guide

This guide explains how the **Project Management (PM)** module works in this codebase: where to click in the UI, which files implement each feature, how screens connect, how roles affect access, and how data flows from browser to database.

Paths are relative to the monorepo root unless noted.

---

## 1. Project Module Overview

### Purpose

The Project Management module is the operational core for construction projects after award. It lets a company:

- Register and track **projects** (portfolio)
- Staff **project teams**
- Manage **schedule** (milestones, tasks, Gantt, calendar)
- Run site and document workflows: **RFIs**, **submittals**, **drawings**, **daily logs**, **meetings**, **correspondence**
- Track **risks**, **issues**, and **punch list** items
- Execute **project closeout**

All data is **company-scoped** (`company_id` from JWT). Project sub-resources are **project-scoped** (`projectId` in the URL).

### Main workflows

| Workflow | User goal | Primary UI |
|----------|-----------|------------|
| Portfolio management | See all projects, filter, create/edit | `/projects`, `/kanban-board` |
| Project execution | Open one project and work across tabs | `/projects/[projectId]/*` |
| Programme / schedule | Plan tasks, milestones, dependencies | Schedule tab |
| Site communication | RFIs, correspondence, meetings | RFIs / Correspondence / Meetings tabs |
| Document control | Submittals, drawings, project files | Submittals / Drawings / Documents tabs |
| Quality & safety | Risks, issues, punch items, daily logs | Risks / Issues / Punch List / Daily Logs |
| Handover | Closeout checklist | Closeout tab |

### Main entities

| Entity | Role in the module |
|--------|-------------------|
| `Project` | Root record - code, name, status, dates, budget |
| `ProjectTeam` | Users assigned to a project with a role |
| `Milestone` / `Task` / `TaskDependency` | Schedule programme |
| `Rfi` / `RfiResponse` | Formal questions and answers |
| `Submittal` / `SubmittalReview` | Material and shop drawing approvals |
| `Drawing` / `DrawingVersion` / `DrawingLink` | Drawing register and revisions |
| `DailyLog` (+ workforce/equipment/visitor children) | Site diary |
| `Meeting` (+ agenda, attendees, action items) | Site meetings |
| `Correspondence` | Letters, notices, memos |
| `Risk` | Risk register |
| `Issue` | Defects / site issues |
| `PunchItem` | Snagging / punch list |
| `Closeout` / `CloseoutChecklistItem` | Practical completion handover |
| `DocumentFolder` (context `PROJECT`) | Project file repository (Core Documents module) |

Types for the frontend live in `frontend/lib/api/project-management.types.ts`.

### Feature map

```text
Projects (Portfolio)
├── Project List                    → /projects
├── Portfolio Kanban                → /kanban-board
├── Project Details (Shell)         → /projects/[projectId]
│   ├── Dashboard                   → KPIs, quick links, schedule summary
│   ├── Project Team                → assign/remove members
│   ├── Documents                   → project document folder (Core Documents)
│   ├── Schedule
│   │   ├── Gantt                   → timeline view
│   │   ├── Tasks                   → task table CRUD
│   │   ├── Milestones              → milestone CRUD
│   │   └── Calendar                → month/year task calendar
│   ├── RFIs                        → list + detail drawer + responses
│   ├── Submittals                  → list + detail drawer + reviews
│   ├── Drawings                    → list + detail drawer + versions/links
│   ├── Daily Logs                  → list + detail drawer
│   ├── Meetings                    → list + CRUD
│   ├── Correspondence              → list + CRUD
│   ├── Risks                       → risk register
│   ├── Issues                      → issues / defects
│   ├── Punch List                  → punch items
│   └── Closeout                    → checklist and status
└── Reports (global)                → /reports (placeholder - not PM-specific yet)
```

### How features relate

```text
                    ┌─────────────┐
                    │   Project   │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐   ┌────────────┐  ┌────────────┐
    │   Team     │   │  Schedule  │  │ Documents  │
    └────────────┘   └─────┬──────┘  └────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         Milestones     Tasks      Dependencies
                           │
                           ▼
                    Progress KPIs
                    (Dashboard + Schedule KPI bar)

Site operations (RFIs, Issues, Daily Logs) reference project context.
Drawings link to Document folders and can link to RFIs/Issues via DrawingLink.
Closeout aggregates handover when project nears completion.
```

---

## 2. Complete UI Navigation Map

All PM pages use the **dashboard layout**: `frontend/app/(dashboard)/layout.tsx` → `AppShell` (top nav + sidebar).

### Global (portfolio-level)

```text
Projects - List
├── Route:        /projects
├── Page file:    frontend/app/(dashboard)/projects/page.tsx
├── Component:    frontend/components/modules/projects/ProjectsPageContent.tsx
├── Parent layout: AppShell → (dashboard)/layout.tsx
├── Sidebar:      AppShell → "Projects" (href /projects)
└── Opens from:   Sidebar, breadcrumb from project shell

Kanban Board - Portfolio
├── Route:        /kanban-board
├── Page file:    frontend/app/(dashboard)/kanban-board/page.tsx
├── Component:    frontend/components/modules/projects/PortfolioKanbanPageContent.tsx
├── Parent layout: AppShell
├── Sidebar:      AppShell → "Kanban Board"
└── Opens from:   Sidebar
```

### Project shell (all tabs share layout)

```text
Project Shell (wraps every /projects/[projectId]/* page)
├── Route pattern: /projects/[projectId]/*
├── Layout file:   frontend/app/(dashboard)/projects/[projectId]/layout.tsx
├── Shell:         frontend/components/modules/projects/ProjectShell.tsx
├── Parent layout: AppShell
└── Opens from:    Project list link, Kanban card click, dashboard quick links
```

### Project tabs (14 sub-pages)

| Tab | Route | Page file | Content component |
|-----|-------|-----------|-------------------|
| Dashboard | `/projects/[id]` | `[projectId]/page.tsx` | `ProjectDashboard.tsx` |
| Team | `/projects/[id]/team` | `team/page.tsx` | `ProjectTeamPanel.tsx` |
| Documents | `/projects/[id]/documents` | `documents/page.tsx` | `ProjectDocumentsPanel.tsx` |
| Schedule | `/projects/[id]/schedule` | `schedule/page.tsx` | `schedule/SchedulePageContent.tsx` |
| RFIs | `/projects/[id]/rfis` | `rfis/page.tsx` | `rfis/RfisPageContent.tsx` |
| Submittals | `/projects/[id]/submittals` | `submittals/page.tsx` | `submittals/SubmittalsPageContent.tsx` |
| Drawings | `/projects/[id]/drawings` | `drawings/page.tsx` | `drawings/DrawingsPageContent.tsx` |
| Daily Logs | `/projects/[id]/daily-logs` | `daily-logs/page.tsx` | `daily-logs/DailyLogsPageContent.tsx` |
| Meetings | `/projects/[id]/meetings` | `meetings/page.tsx` | `meetings/MeetingsPageContent.tsx` |
| Correspondence | `/projects/[id]/correspondence` | `correspondence/page.tsx` | `correspondence/CorrespondencePageContent.tsx` |
| Risks | `/projects/[id]/risks` | `risks/page.tsx` | `risks/RisksPageContent.tsx` |
| Issues | `/projects/[id]/issues` | `issues/page.tsx` | `issues/IssuesPageContent.tsx` |
| Punch List | `/projects/[id]/punch-list` | `punch-list/page.tsx` | `punch-items/PunchItemsPageContent.tsx` |
| Closeout | `/projects/[id]/closeout` | `closeout/page.tsx` | `closeout/CloseoutPageContent.tsx` |

### Navigation tree

```text
AppShell Sidebar
├── Projects (/projects)
│   └── [Click project code]
│       └── ProjectShell tabs (14)
│           ├── Dashboard (default)
│           ├── Team
│           ├── Documents
│           ├── Schedule → Gantt | Tasks | Milestones | Calendar
│           ├── RFIs → [row click] → RfiDetailDrawer
│           ├── Submittals → SubmittalDetailDrawer
│           ├── Drawings → DrawingDetailDrawer
│           ├── Daily Logs → DailyLogDetailDrawer
│           ├── Meetings
│           ├── Correspondence
│           ├── Risks
│           ├── Issues → IssueDetailDrawer
│           ├── Punch List
│           └── Closeout
└── Kanban Board (/kanban-board)
    └── [Click card] → /projects/[id]
```

**Note:** `ProjectShell` shows all 14 tabs regardless of role. Enforcement happens on the **API** (`PermissionsGuard` + `@RequirePermission`). The frontend capability flags (`capabilities.pm`) are probed at login but **not** used to hide most PM tabs yet.

---

## 3. Screen-by-Screen Analysis

### 3.1 Project List (`/projects`)

**Purpose:** Company-wide portfolio - search, filter by status, paginate, create and edit projects.

**How user reaches it:** Sidebar → Projects.

**Main components:**
- `ProjectsPageContent` - page orchestration
- `DataTable` - project grid
- `ProjectFormDrawer` - create/edit form
- `StatusBadge`, `FormLayout`, `PlaceholderPage`

**Data displayed:** `projectCode`, `name`, `projectType`, `status`, `plannedFinishDate`, `budget`, `location`

**User actions:**
- Search by name/code
- Filter by status
- Paginate (20 per page)
- Create project (drawer)
- Edit project (row action → drawer)
- Open project (click code → `/projects/[id]`)

**Dependency flow:**

```text
ProjectsPageContent
 ├── useProjects()           → GET /api/projects
 ├── ProjectFormDrawer
 │    ├── useCreateProject() → POST /api/projects
 │    └── useUpdateProject() → PATCH /api/projects/:id
 ├── useAuthStore            → gate fetch until authenticated
 └── useAuthHydrated         → wait for persisted auth rehydration
```

**Files:**
- `frontend/app/(dashboard)/projects/page.tsx`
- `frontend/components/modules/projects/ProjectsPageContent.tsx`
- `frontend/components/modules/projects/ProjectFormDrawer.tsx`
- `frontend/lib/query/projects.ts`

---

### 3.2 Portfolio Kanban (`/kanban-board`)

**Purpose:** Visual portfolio by project status columns (Planning, Active, On Hold, etc.).

**How user reaches it:** Sidebar → Kanban Board.

**Main components:** `PortfolioKanbanPageContent`, `KanbanColumn`, `ProjectKanbanCard`

**Data displayed:** Project cards grouped by `status`; optional user names if `canManageUsers`

**User actions:** Click card → navigate to project dashboard

**Dependency flow:**

```text
PortfolioKanbanPageContent
 ├── useAllProjects()        → paginated GET /api/projects (sequential pages)
 ├── useUsers()              → only if capabilities.canManageUsers
 └── portfolio-kanban utils  → column grouping
```

---

### 3.3 Project Dashboard (`/projects/[id]`)

**Purpose:** Single-project home - KPIs, schedule variance, quick links to RFIs/Issues/Documents.

**Main components:** `ProjectDashboard`, `KPICard`, `FormLayout`

**Data displayed:**
- From `GET /projects/:id/dashboard`: open RFIs, issues, punch items, submittals counts, progress %
- Fallback: `useAllTasks()` + `computeScheduleMetrics()` if dashboard API unavailable

**User actions:** Navigate via quick-link cards to submodules

**Dependency flow:**

```text
ProjectDashboard
 ├── useProjectDashboardStats() → GET /projects/:id/dashboard
 ├── useAllTasks()              → GET /projects/:id/schedule/tasks (paginated)
 └── computeScheduleMetrics()   → frontend/lib/utils/schedule-metrics.ts
```

Wrapped by `ProjectShell` (header, breadcrumb, tabs).

---

### 3.4 Project Team (`/projects/[id]/team`)

**Purpose:** Assign users to the project with a role-on-project label.

**User actions:** Add member (modal), remove member (confirm dialog)

**Dependency flow:**

```text
ProjectTeamPanel
 ├── useProjectTeam()              → GET /projects/:id/team
 ├── useAddProjectTeamMember()     → POST /projects/:id/team
 ├── useRemoveProjectTeamMember()  → DELETE /projects/:id/team/:memberId
 └── useUsers()                    → user picker labels
```

---

### 3.5 Project Documents (`/projects/[id]/documents`)

**Purpose:** Show files in the project's `DocumentFolder` (context `PROJECT` + `contextId` = project id).

**User actions:** View/download files; upload if folder exists and user has `documents` permissions

**Dependency flow:**

```text
ProjectDocumentsPanel
 ├── useProjectDocumentFolder()  → GET /document-folders?contextType=PROJECT&contextId=...
 └── DocumentAttachmentPanel
      ├── useFolderDocuments()   → GET /document-folders/:id/documents
      └── useUploadDocumentToFolder() → POST (multipart)
```

Demo seed creates one folder per project with 3 PDFs (`backend/prisma/seed-pm-demo.ts`).

---

### 3.6 Schedule (`/projects/[id]/schedule`)

**Purpose:** Programme management - Gantt, task list, milestones, calendar.

**Tabs inside page:** Gantt | Tasks | Milestones | Calendar (`SchedulePageContent`)

| Sub-tab | Component | Data source |
|---------|-----------|-------------|
| Gantt | `ScheduleGantt` | `useAllTasks`, `useTaskDependencies` |
| Tasks | `TasksPanel` | tasks passed from parent; mutations via `schedule.ts` |
| Milestones | `MilestonesPanel` | `useMilestones` (lazy when tab active) |
| Calendar | `ScheduleCalendar` | tasks from parent; month/year views |

**User actions:** CRUD tasks/milestones/dependencies; toggle critical-path filter; update progress and status on tasks

**Dependency flow:**

```text
SchedulePageContent
 ├── useAllTasks(projectId)
 ├── useMilestones(projectId)         → enabled when Milestones tab active
 ├── useTaskDependencies(projectId)   → enabled when Gantt tab active
 ├── ScheduleKpiBar                   → computeScheduleMetrics(tasks)
 ├── ScheduleGantt
 ├── TasksPanel
 ├── MilestonesPanel
 └── ScheduleCalendar
```

---

### 3.7 RFIs (`/projects/[id]/rfis`)

**Purpose:** Request for Information register with workflow statuses.

**Pattern:** List page + `RfiDetailDrawer` for detail, status change, responses.

```text
RfisPageContent
 ├── useRfis() / useCreateRfi / useUpdateRfi / useDeleteRfi
 └── RfiDetailDrawer
      ├── useRfi() / useRfiResponses()
      ├── useAddRfiResponse()
      ├── WorkflowStepper (RFI_WORKFLOW)
      └── DocumentAttachmentPanel (placeholder folder)
```

---

### 3.8–3.13 Other submodule pages

Each submodule follows the same **list + drawer/form** pattern:

| Screen | List component | Detail / form | Query module |
|--------|----------------|---------------|--------------|
| Submittals | `SubmittalsPageContent` | `SubmittalDetailDrawer` | `lib/query/submittals.ts` |
| Drawings | `DrawingsPageContent` | `DrawingDetailDrawer` | `lib/query/drawings.ts` |
| Daily Logs | `DailyLogsPageContent` | `DailyLogDetailDrawer` | `lib/query/daily-logs.ts` |
| Meetings | `MeetingsPageContent` | inline drawer | `lib/query/meetings.ts` |
| Correspondence | `CorrespondencePageContent` | inline drawer | `lib/query/correspondence.ts` |
| Risks | `RisksPageContent` | inline drawer | `lib/query/risks.ts` |
| Issues | `IssuesPageContent` | `IssueDetailDrawer` | `lib/query/issues.ts` |
| Punch List | `PunchItemsPageContent` | inline drawer | `lib/query/punch-items.ts` |
| Closeout | `CloseoutPageContent` | checklist UI | `lib/query/closeout.ts` |

Shared UI: `DataTable`, `PageHeader` (where used), `StatusBadge`, `WorkflowStepper`, `ConfirmDialog`, `FormLayout`.

---

### 3.14 Reports (`/reports`)

**Purpose (intended):** Company reporting and BI.

**Current state:** Placeholder only (`PlaceholderPage`). **Not** part of implemented PM reporting. Project-level metrics live on **Project Dashboard** and **Schedule KPI bar**.

---

## 4. User Journey Walkthrough

### 4.1 Create Project

```text
User clicks "New project" on /projects
        ↓
ProjectsPageContent sets drawerOpen=true, editingProject=null
        ↓
ProjectFormDrawer opens (Ant Design Drawer + Form)
        ↓
User fills projectCode, name, dates, budget, status, PM user
        ↓
Submit → useCreateProject().mutateAsync()
        ↓
POST /api/projects  (ProjectsController.create → ProjectsService.createProject)
        ↓
Prisma project.create (companyId from JWT)
        ↓
onSuccess: invalidateQueries projectKeys.lists()
        ↓
Drawer closes; useProjects refetches; table updates
```

**Files:** `ProjectsPageContent.tsx`, `ProjectFormDrawer.tsx`, `lib/query/projects.ts`, `projects.controller.ts`, `projects.service.ts`, `pm.dtos.ts` (`CreateProjectDto`), `pm-mapper.util.ts`

---

### 4.2 Update Project

```text
User clicks Edit on table row
        ↓
setEditingProject(record); drawerOpen=true
        ↓
ProjectFormDrawer loads values via toFormValues(project)
        ↓
Submit → useUpdateProject() → PATCH /api/projects/:id
        ↓
Invalidate list + detail queries
```

---

### 4.3 Assign Team Member

```text
User opens /projects/[id]/team → "Add member"
        ↓
Modal with UserSelect + roleOnProject field
        ↓
useAddProjectTeamMember() → POST /projects/:id/team
        ↓
Body: { userId, roleOnProject }  (AddProjectTeamMemberDto)
        ↓
Invalidate projectKeys.team(projectId)
```

**Files:** `ProjectTeamPanel.tsx`, `lib/query/projects.ts`, `projects.service.ts` (`addTeamMember`)

---

### 4.4 Create Task

```text
User opens Schedule → Tasks tab → "Add task"
        ↓
TasksPanel → TaskFormDrawer opens
        ↓
useCreateTask() → POST /projects/:id/schedule/tasks
        ↓
ScheduleService.createTask (validates project scope, writes Task row)
        ↓
invalidateQueries scheduleKeys.tasks(projectId)
        ↓
SchedulePageContent useAllTasks refetches; Gantt/Tasks/Calendar update
```

**Files:** `TasksPanel.tsx`, `schedule/SchedulePageContent.tsx`, `lib/query/schedule.ts`, `schedule.controller.ts`, `schedule.service.ts`

---

### 4.5 Update Task Status / Progress

```text
User edits task in TaskFormDrawer (status, progressPct, dates, isCritical)
        ↓
useUpdateTask() → PATCH /projects/:id/schedule/tasks/:taskId
        ↓
ScheduleService.updateTask
        ↓
Cache invalidation → UI refresh
        ↓
Dashboard schedule KPIs recompute on next visit (computeScheduleMetrics)
```

---

### 4.6 Create Milestone

```text
Schedule → Milestones tab → "Add milestone"
        ↓
MilestoneFormDrawer → useCreateMilestone()
        ↓
POST /projects/:id/schedule/milestones
        ↓
Invalidate scheduleKeys.milestones(projectId)
```

**Files:** `MilestonesPanel.tsx`, `lib/query/schedule.ts`, `schedule.service.ts`

---

### 4.7 Submit Progress Update

Progress is stored **on the task** (`progressPct` 0–100), not a separate progress entity.

```text
User edits task → sets progressPct (and optionally status)
        ↓
PATCH task (UpdateTaskDto)
        ↓
Schedule KPI bar + Gantt bar fill + Dashboard metrics reflect new average
```

`computeScheduleMetrics()` in `frontend/lib/utils/schedule-metrics.ts` calculates:
- `actualProgressPct` - average of task `progressPct`
- `plannedProgressPct` - time-based expected progress from start/finish dates
- `scheduleVariancePct` - actual minus planned

---

### 4.8 Generate Report

**Implemented today:**
- **Project Dashboard stats** - `GET /projects/:id/dashboard` (counts + progress)
- **Schedule KPI bar** - client-side from tasks
- **Portfolio Kanban** - visual status distribution

**Not implemented:**
- `/reports` page is a placeholder
- No export/PDF job for PM reports yet
- No BullMQ report generation for PM

**Closest workflow:**

```text
User opens /projects/[id] (Dashboard)
        ↓
useProjectDashboardStats(projectId)
        ↓
ProjectsService.getDashboardStats - aggregates open RFIs, issues, punch, submittals, task progress
        ↓
KPICard grid displays metrics
```

For a future report export, you would extend `backend/src/modules/reporting/` and add a frontend action on Dashboard or Reports.

---

## 5. Roles and Access

### Roles that interact with PM (seeded in `backend/prisma/seed.ts`)

| Role | PM involvement |
|------|----------------|
| **System Administrator** | Full access to all modules including all PM permissions |
| **Managing Director** | Full CRUD on all 12 PM permission modules |
| **Project Manager** | Full CRUD on all 12 PM permission modules |
| **Site Engineer** | `projects`, `schedule`, `rfis`, `daily_logs`, `issues`, `punch_items`, `risks` - view/create/edit (no delete) |
| **Document Controller** | `projects`, `submittals`, `drawings`, `correspondence` - view/create/edit (no delete) |
| **Safety Officer** | `projects`, `risks`, `issues`, `daily_logs` - view/create/edit (no delete) |
| **Employee** | View-only on all PM modules |
| Finance, HR, Procurement, etc. | No PM permissions in seed (unless custom roles added) |

Demo users in `seed-pm-demo.ts`: `pm@`, `engineer@`, `safety@`, `docs@` company.local - same password as admin.

### Permission modules (backend)

Each submodule uses `{module}.{action}` via `@RequirePermission`:

`projects`, `schedule`, `rfis`, `submittals`, `drawings`, `daily_logs`, `meetings`, `correspondence`, `risks`, `issues`, `punch_items`, `closeout`

Actions: `view`, `create`, `edit`, `delete`

### What menu items each role sees

Sidebar PM entries (from `AppShell.tsx`):
- **Projects** - all authenticated users (API may 403)
- **Kanban Board** - all authenticated users

**Project tabs** - visible to all users who can open a project; API enforces per submodule.

### Permission matrix (seed defaults)

Legend: **V** view, **C** create, **E** edit, **D** delete, **-** none

| Module | Sys Admin / MD / PM | Site Engineer | Doc Controller | Safety Officer | Employee |
|--------|---------------------|---------------|----------------|--------------|----------|
| projects | V C E D | V C E | V C E | V C E | V |
| schedule | V C E D | V C E | - | - | V |
| rfis | V C E D | V C E | - | - | V |
| submittals | V C E D | - | V C E | - | V |
| drawings | V C E D | - | V C E | - | V |
| daily_logs | V C E D | V C E | - | V C E | V |
| meetings | V C E D | - | - | - | V |
| correspondence | V C E D | - | V C E | - | V |
| risks | V C E D | V C E | - | V C E | V |
| issues | V C E D | V C E | - | V C E | V |
| punch_items | V C E D | V C E | - | - | V |
| closeout | V C E D | - | - | - | V |

**Documents** (project files tab) uses the **`documents`** permission module (Core Foundation), not PM modules. Admin has full access; others need `documents.view` / `documents.create`.

### Frontend enforcement (current)

| Layer | Behavior |
|-------|----------|
| `middleware.ts` | JWT cookie only - no RBAC |
| `fetchPmCapabilities()` | Probes endpoints; sets `canView` only |
| Most PM pages | Rely on API 403 + error UI |
| `ProjectDocumentsPanel` | Explicit 403 message |
| `ProjectShell` tabs | **Not** filtered by capabilities |

---

## 6. File-by-File Module Analysis

### 6.1 Frontend - App routes

| File | Purpose | Imported by | Depends on |
|------|---------|-------------|------------|
| `frontend/app/(dashboard)/projects/page.tsx` | Route entry for list | Next.js router | `ProjectsPageContent` |
| `frontend/app/(dashboard)/projects/[projectId]/layout.tsx` | Project layout | Next.js | `ProjectShell` |
| `frontend/app/(dashboard)/projects/[projectId]/page.tsx` | Dashboard route | Next.js | `ProjectDashboard` |
| `frontend/app/(dashboard)/projects/[projectId]/*/page.tsx` | Submodule routes | Next.js | respective `*PageContent` |
| `frontend/app/(dashboard)/kanban-board/page.tsx` | Kanban route | Next.js | `PortfolioKanbanPageContent` |

**When it executes:** On navigation to matching URL (React Server Component shell → client components hydrate).

---

### 6.2 Frontend - Core PM components

| File | Purpose | Key exports | Depends on |
|------|---------|-------------|------------|
| `ProjectShell.tsx` | Breadcrumb, header, 14 tabs, project context store | default | `useProject`, `project-context.store` |
| `ProjectsPageContent.tsx` | Portfolio table, filters, create/edit | default | `useProjects`, `ProjectFormDrawer` |
| `ProjectFormDrawer.tsx` | Create/update project form | default | `useCreateProject`, `useUpdateProject` |
| `ProjectDashboard.tsx` | Project home KPIs | default | `useProjectDashboardStats`, `useAllTasks` |
| `ProjectTeamPanel.tsx` | Team CRUD | default | `useProjectTeam`, mutations |
| `ProjectDocumentsPanel.tsx` | Resolve project folder, show files | default | `useProjectDocumentFolder` |
| `PortfolioKanbanPageContent.tsx` | Status columns | default | `useAllProjects` |
| `KanbanColumn.tsx` | Single kanban column | default | `ProjectKanbanCard` |
| `ProjectKanbanCard.tsx` | Project card UI | default | - |

---

### 6.3 Frontend - Submodule components (pattern)

Each `*PageContent.tsx`:
- Owns list state (page, filters, selected row)
- Calls `useQuery` hooks from `lib/query/{module}.ts`
- Opens drawer/modal for create/edit/detail
- Uses shared `DataTable`, `StatusBadge`, `FormLayout`

Detail drawers (`*DetailDrawer.tsx`): fetch single record + child records (responses, reviews, versions).

Schedule subdirectory:
- `SchedulePageContent.tsx` - tab orchestration
- `ScheduleGantt.tsx` - Gantt timeline UI
- `TasksPanel.tsx` - task table + `TaskFormDrawer`
- `MilestonesPanel.tsx` - milestone table + form drawer
- `ScheduleCalendar.tsx` - month/year calendar
- `ScheduleKpiBar.tsx` - metric cards

---

### 6.4 Frontend - Query layer (`lib/query/`)

| File | Purpose | Key hooks | API prefix |
|------|---------|-----------|------------|
| `projects.ts` | Project CRUD, team, dashboard | `useProjects`, `useAllProjects`, `useProject`, `useCreateProject`, `useUpdateProject`, `useDeleteProject`, `useProjectTeam`, `useProjectDashboardStats` | `/projects` |
| `schedule.ts` | Schedule data | `useMilestones`, `useTasks`, `useAllTasks`, `useTaskDependencies`, mutations | `/projects/:id/schedule` |
| `rfis.ts` | RFIs + responses | `useRfis`, `useRfi`, `useRfiResponses`, mutations | `/projects/:id/rfis` |
| `submittals.ts` | Submittals + reviews | similar pattern | `/projects/:id/submittals` |
| `drawings.ts` | Drawings, versions, links | similar pattern | `/projects/:id/drawings` |
| `daily-logs.ts` | Daily logs | similar pattern | `/projects/:id/daily-logs` |
| `meetings.ts` | Meetings | similar pattern | `/projects/:id/meetings` |
| `correspondence.ts` | Correspondence | similar pattern | `/projects/:id/correspondence` |
| `risks.ts` | Risks | similar pattern | `/projects/:id/risks` |
| `issues.ts` | Issues | similar pattern | `/projects/:id/issues` |
| `punch-items.ts` | Punch items | similar pattern | `/projects/:id/punch-items` |
| `closeout.ts` | Closeout | similar pattern | `/projects/:id/closeout` |
| `pm-query-utils.ts` | `projectPath()`, `toQueryString()` | - | - |
| `documents.ts` | Project folder resolution | `useProjectDocumentFolder`, `useFolderDocuments` | `/document-folders` |

**Cache keys pattern:** `['pm', 'projects', ...]` or `['pm', 'schedule', projectId, ...]`

**Invalidation:** Mutations call `queryClient.invalidateQueries({ queryKey: ... })` on the parent key (e.g. all tasks for a project).

---

### 6.5 Frontend - Supporting files

| File | Purpose |
|------|---------|
| `lib/api/project-management.types.ts` | All PM TypeScript interfaces |
| `lib/api/workflow.ts` | Status workflows (PROJECT, RFI, SUBMITTAL, ISSUE, etc.) |
| `lib/utils/project-display.ts` | Format dates, budget, status labels |
| `lib/utils/pm-status-display.ts` | StatusBadge variant mapping |
| `lib/utils/schedule-metrics.ts` | Gantt layout, KPI calculations |
| `lib/utils/portfolio-kanban.ts` | Kanban column grouping |
| `lib/permissions/capabilities.ts` | PM capability probing at login |
| `stores/auth.store.ts` | JWT user, capabilities |
| `stores/project-context.store.ts` | Active project summary while inside shell |
| `hooks/useAuthHydrated.ts` | Wait for Zustand persist rehydration |
| `hooks/useUserNameLookup.ts` | Resolve user id → display name |

---

### 6.6 Backend - Module entry

| File | Purpose |
|------|---------|
| `backend/src/modules/project-management/project-management.module.ts` | Registers 12 controllers, 15 services |

Registered in `backend/src/app.module.ts` as `ProjectManagementModule`.

---

### 6.7 Backend - Controllers (presentation)

Each controller:
- Path prefix under `@Controller('projects/:projectId/...')` except `ProjectsController` (`projects`)
- `@UseGuards(PermissionsGuard)`
- `@RequirePermission('module', 'action')` on each handler
- Delegates to application service with `{ companyId, userId }` context

| File | Base path |
|------|-----------|
| `projects.controller.ts` | `/projects` |
| `schedule.controller.ts` | `/projects/:projectId/schedule` |
| `rfis.controller.ts` | `/projects/:projectId/rfis` |
| `submittals.controller.ts` | `/projects/:projectId/submittals` |
| `drawings.controller.ts` | `/projects/:projectId/drawings` |
| `daily-logs.controller.ts` | `/projects/:projectId/daily-logs` |
| `meetings.controller.ts` | `/projects/:projectId/meetings` |
| `correspondence.controller.ts` | `/projects/:projectId/correspondence` |
| `risks.controller.ts` | `/projects/:projectId/risks` |
| `issues.controller.ts` | `/projects/:projectId/issues` |
| `punch-items.controller.ts` | `/projects/:projectId/punch-items` |
| `closeout.controller.ts` | `/projects/:projectId/closeout` |

**When it executes:** On HTTP request after `JwtAuthGuard` and `PermissionsGuard` pass.

---

### 6.8 Backend - Services (application)

| File | Responsibility |
|------|----------------|
| `projects.service.ts` | Project CRUD, dashboard stats, team |
| `project-scope.service.ts` | `getProjectOrThrow` - tenancy + existence |
| `schedule.service.ts` | Milestones, tasks, dependencies |
| `rfis.service.ts` | RFIs + responses |
| `submittals.service.ts` | Submittals + reviews |
| `drawings.service.ts` | Drawings, versions, links, folder validation |
| `daily-logs.service.ts` | Daily logs |
| `meetings.service.ts` | Meetings |
| `correspondence.service.ts` | Correspondence |
| `risks.service.ts` | Risks |
| `issues.service.ts` | Issues |
| `punch-items.service.ts` | Punch items |
| `closeout.service.ts` | Closeout + checklist |
| `document-number.service.ts` | Auto-number RFIs, issues, etc. via PostgreSQL sequences |

**Architecture note:** Services call `PrismaService` directly (no separate repository layer in this module yet).

---

### 6.9 Backend - DTOs and utilities

| File | Purpose |
|------|---------|
| `application/dtos/pm.dtos.ts` | All request/query DTOs (35 classes) |
| `application/utils/pm-mapper.util.ts` | Prisma row → API response mapping |
| `application/utils/pm-pagination.util.ts` | Sort field allow-list for PM lists |
| `application/types/pm-context.type.ts` | `{ companyId, userId }` |

---

### 6.10 Seed and demo data

| File | Purpose |
|------|---------|
| `backend/prisma/seed.ts` | PM permissions, roles, role-permission matrix |
| `backend/prisma/seed-pm-demo.ts` | DEMO-001…007 projects with full submodule sample data |

---

## 7. Frontend Component Hierarchy

### Project List page

```text
ProjectsPageContent
├── FormLayout (title area)
├── Input.Search
├── Select (status filter)
├── Button "New project"
├── DataTable<Project>
│   └── columns: code link, name, type, status badge, dates, budget, edit action
├── Pagination
└── ProjectFormDrawer
    ├── Form (Ant Design)
    ├── UserSelect (project manager)
    ├── DatePicker fields
    └── useCreateProject / useUpdateProject on submit
```

### Project Shell (wraps all project tabs)

```text
ProjectShell
├── Breadcrumb (Projects → project name)
├── Header card (code, name, StatusBadge, dates, budget, location)
├── Tabs (14 links - router navigation via href)
└── children → active tab page component
```

### Schedule page

```text
SchedulePageContent
├── ScheduleKpiBar (4× KPICard - task count, critical, progress, variance)
└── Tabs (destroyOnHidden)
    ├── ScheduleGantt
    │   ├── Legend
    │   ├── Timeline header (months/weeks)
    │   ├── Task rows + bars + today marker
    │   └── Dependencies Table
    ├── TasksPanel
    │   ├── DataTable<Task>
    │   ├── TaskFormDrawer
    │   ├── Dependency Modal
    │   └── ConfirmDialog (delete)
    ├── MilestonesPanel
    │   ├── DataTable<Milestone>
    │   └── MilestoneFormDrawer
    └── ScheduleCalendar
        ├── Segmented (Month / Year)
        └── Calendar (fullscreen)
```

### RFI page (representative submodule)

```text
RfisPageContent
├── PageHeader / FormLayout
├── Filters + "New RFI" button
├── DataTable<Rfi>
└── RfiDetailDrawer
    ├── WorkflowStepper
    ├── Descriptions (metadata)
    ├── Select (status update)
    ├── Responses list (ul/li)
    ├── Form (add response)
    └── DocumentAttachmentPanel
```

---

## 8. State Management and Data Flow

### State layers

| Layer | Technology | Used for |
|-------|------------|----------|
| Server/API state | **TanStack Query v5** | All PM lists, details, stats |
| Auth session | **Zustand** (`auth.store`) | Token, user, capabilities |
| Active project | **Zustand** (`project-context.store`) | Summary while inside `ProjectShell` |
| Form state | **Ant Design Form** | All create/edit drawers |
| Local UI state | **useState** | Drawer open, selected row, filters, active tab |

**No React Context** for PM data. **No PM data in Zustand** (by design - TanStack Query owns server state).

### Query client defaults

`frontend/lib/query/provider.tsx`:
- `staleTime: 30_000`
- `retry: 1`
- `refetchOnWindowFocus: false`

Schedule queries override with `staleTime: 60_000`, `refetchOnMount: false`.

### Data flow diagram

```text
┌──────────────┐     Bearer JWT      ┌─────────────────┐
│  PM Page     │ ─── useQuery ──────►│  Axios client   │
│  Component   │                     │  lib/api/client │
└──────────────┘                     └────────┬────────┘
                                              │ REST
                                              ▼
                                     ┌─────────────────┐
                                     │ NestJS Controller│
                                     │ + Permissions    │
                                     └────────┬────────┘
                                              ▼
                                     ┌─────────────────┐
                                     │ Service + Prisma │
                                     └────────┬────────┘
                                              ▼
                                     ┌─────────────────┐
                                     │   PostgreSQL     │
                                     └─────────────────┘

Mutation path:
  User submit → useMutation → POST/PATCH/DELETE
            → onSuccess → invalidateQueries
            → affected useQuery hooks refetch
            → UI updates
```

### Cache invalidation examples

| Mutation | Invalidates |
|----------|-------------|
| `useCreateProject` | `projectKeys.lists()` |
| `useUpdateProject` | `projectKeys.lists()`, `projectKeys.detail(id)` |
| `useCreateTask` | `scheduleKeys.tasks(projectId)` |
| `useAddProjectTeamMember` | `projectKeys.team(projectId)` |
| `useUploadDocumentToFolder` | `documentKeys.folderDocuments()` |

### Auth → capabilities → PM

```text
Login (useLogin)
  → fetchCapabilities()
      → GET /auth/capabilities
      → fetchPmCapabilities() sequential probes
  → setCapabilities in auth.store

PM pages generally do NOT read capabilities.pm for gating;
they call APIs and handle 401/403.
```

---

## 9. Backend Processing Flow

### Standard read (list)

```text
HTTP GET /api/projects/:projectId/{resource}?page=1&limit=20
        ↓
JwtAuthGuard (APP_GUARD) - attach user to request
        ↓
PermissionsGuard - check role permissions for module.view
        ↓
{Module}Controller.list(projectId, query)
        ↓
{Module}Service.list*(ctx, projectId, query)
        ↓
projectScopeService.getProjectOrThrow(ctx, projectId)
        ↓
prisma.{model}.findMany({ where: { projectId, companyId, deletedAt: null }, skip, take })
        ↓
map*() in pm-mapper.util.ts
        ↓
buildPaginatedResult → ResponseEnvelopeInterceptor → { success, data, meta }
```

### Standard create

```text
HTTP POST + JSON body (validated by ValidationPipe + DTO)
        ↓
PermissionsGuard - module.create
        ↓
Service.create*
        ↓
Optional: documentNumberService.getNextNumber(ctx, 'RFI') etc.
        ↓
prisma.{model}.create({ data: { ..., companyId, createdBy } })
        ↓
Mapped entity returned
```

### Project dashboard stats (aggregated read)

```text
GET /projects/:projectId/dashboard
        ↓
ProjectsService.getDashboardStats
        ↓
Parallel prisma counts / aggregates on tasks, rfis, issues, punch_items, submittals
        ↓
MappedProjectDashboardStats
```

### Document folder for project (cross-module)

```text
GET /document-folders?contextType=PROJECT&contextId={projectId}
        ↓
DocumentService.listFolders (documents module)
        ↓
Not in project-management module - separate DocumentsModule
```

---

## 10. Background Jobs Related to Projects

**Current state: none in the PM module.**

| Area | Status |
|------|--------|
| BullMQ queue jobs for PM | Not implemented |
| `@Cron` scheduled PM tasks | Not implemented |
| PM notification emails on RFI/issue | Not implemented |
| Report PDF generation | Not implemented (`/reports` is placeholder) |

**Related (outside PM):**
- `NotificationsModule` - unread count in header (`useUnreadNotificationCount`); not PM-event-driven yet
- `DocumentNumberService` - synchronous sequence next-number on create (not queued)

When adding async work later, follow `.cursorrules`: queue via BullMQ, processor in infrastructure layer.

---

## 11. Code Reading Order

Study the module in this order. Each step builds on the previous.

### Step 1 - Portfolio entry page

**Read:** `frontend/app/(dashboard)/projects/page.tsx` → `ProjectsPageContent.tsx`

**Why:** Simplest end-to-end screen: list + create. Shows the standard DataTable + drawer + query hook pattern used everywhere.

### Step 2 - Dashboard layout shell

**Read:** `frontend/app/(dashboard)/layout.tsx` → `components/ui/AppShell/AppShell.tsx`

**Why:** Understand sidebar links (`/projects`, `/kanban-board`) and where page titles come from.

### Step 3 - Project shell and routing

**Read:** `frontend/app/(dashboard)/projects/[projectId]/layout.tsx` → `ProjectShell.tsx`

**Why:** All 14 project tabs share this layout. Learn tab definitions, `useProject`, and `project-context.store`.

### Step 4 - Query layer for projects

**Read:** `frontend/lib/query/projects.ts` → `frontend/lib/query/pm-query-utils.ts`

**Why:** Establishes cache keys, pagination, and mutation invalidation conventions copied by all other `lib/query/*.ts` files.

### Step 5 - Domain types and display helpers

**Read:** `frontend/lib/api/project-management.types.ts` → `lib/utils/project-display.ts` → `lib/api/workflow.ts`

**Why:** Every component imports these. Know enums (`ProjectStatus`, `TaskStatus`, etc.) before reading forms.

### Step 6 - One full submodule (RFIs recommended)

**Read:** `RfisPageContent.tsx` → `RfiDetailDrawer.tsx` → `lib/query/rfis.ts`

**Why:** Representative pattern: list, drawer, workflow stepper, nested responses. Other submodules copy this structure.

### Step 7 - Schedule (most complex UI)

**Read:** `SchedulePageContent.tsx` → `TasksPanel.tsx` → `ScheduleGantt.tsx` → `lib/query/schedule.ts` → `lib/utils/schedule-metrics.ts`

**Why:** Multiple tabs, lazy queries, shared task data, Gantt math - hardest frontend area.

### Step 8 - Project documents (cross-module)

**Read:** `ProjectDocumentsPanel.tsx` → `lib/query/documents.ts` → `DocumentAttachmentPanel.tsx`

**Why:** Shows how PM integrates with Core Documents module via folder context.

### Step 9 - Backend module registration

**Read:** `backend/src/modules/project-management/project-management.module.ts` → `backend/src/app.module.ts`

**Why:** See all controllers and services in one place.

### Step 10 - Backend projects vertical slice

**Read:** `projects.controller.ts` → `projects.service.ts` → `project-scope.service.ts` → `pm.dtos.ts` → `pm-mapper.util.ts`

**Why:** Complete request path for the root entity. Other controllers mirror this.

### Step 11 - Backend schedule vertical slice

**Read:** `schedule.controller.ts` → `schedule.service.ts`

**Why:** Nested resource under project; same scope checks as RFIs/issues.

### Step 12 - Permissions and seed data

**Read:** `backend/prisma/seed.ts` (`PM_MODULES`, `pmPermissionFlags`) → `backend/prisma/seed-pm-demo.ts`

**Why:** Understand which roles can do what and what demo data exists for local testing.

### Step 13 - Supporting utilities

**Read:** `document-number.service.ts`, `pm-pagination.util.ts`

**Why:** Auto-numbering and safe sort fields - easy to miss but important for creates and lists.

---

## 12. Complete Project Module Walkthrough

End-to-end path a **Project Manager** takes with files and permissions at each step.

```text
1. LOGIN
   Route: /login
   Component: login page (auth module)
   Files: lib/query/auth.ts, stores/auth.store.ts
   Role: any user
   Service: POST /auth/login → JWT + fetchCapabilities()

2. OPEN DASHBOARD (global)
   Route: / (or default after login)
   Component: dashboard (reporting module - partial)
   PM touchpoint: may show project counts via lib/query/stats.ts

3. NAVIGATE TO PROJECTS
   Route: /projects
   Component: ProjectsPageContent
   Files: app/(dashboard)/projects/page.tsx
   Permission: projects.view
   Service: ProjectsService.listProjects

4. CREATE PROJECT (optional)
   UI: ProjectFormDrawer
   Permission: projects.create
   Service: ProjectsService.createProject
   Files: ProjectFormDrawer.tsx, lib/query/projects.ts

5. OPEN PROJECT
   Route: /projects/[id]
   Component: ProjectShell → ProjectDashboard
   Permission: projects.view
   Service: getProject + getDashboardStats
   Files: ProjectShell.tsx, ProjectDashboard.tsx

6. ASSIGN TEAM
   Route: /projects/[id]/team
   Component: ProjectTeamPanel
   Permission: projects.edit (for add/remove)
   Service: addTeamMember / removeTeamMember
   Files: ProjectTeamPanel.tsx

7. CREATE TASKS
   Route: /projects/[id]/schedule → Tasks tab
   Component: TasksPanel → TaskFormDrawer
   Permission: schedule.create
   Service: ScheduleService.createTask
   Files: TasksPanel.tsx, schedule.ts

8. CREATE MILESTONES
   Route: /projects/[id]/schedule → Milestones tab
   Permission: schedule.create
   Service: ScheduleService.createMilestone

9. TRACK PROGRESS
   UI: Edit task → progressPct, status
   Permission: schedule.edit
   Service: ScheduleService.updateTask
   Display: ScheduleKpiBar, ProjectDashboard metrics

10. RAISE RFI (site communication)
    Route: /projects/[id]/rfis
    Permission: rfis.create
    Service: RfisService.createRfi (+ document number)

11. LOG DAILY SITE ACTIVITY
    Route: /projects/[id]/daily-logs
    Permission: daily_logs.create
    Service: DailyLogsService.createDailyLog

12. MANAGE DOCUMENTS
    Route: /projects/[id]/documents
    Permission: documents.view (Core module)
    Service: DocumentService.listFolders + listDocuments

13. REVIEW PORTFOLIO
    Route: /kanban-board
    Component: PortfolioKanbanPageContent
    Permission: projects.view

14. CLOSEOUT (late stage)
    Route: /projects/[id]/closeout
    Permission: closeout.view / closeout.edit
    Service: CloseoutService
```

### Quick reference - route → backend service

| Step | Route | Controller | Service method |
|------|-------|------------|----------------|
| List projects | `GET /projects` | `ProjectsController.list` | `listProjects` |
| Create project | `POST /projects` | `ProjectsController.create` | `createProject` |
| Dashboard | `GET /projects/:id/dashboard` | `ProjectsController.dashboard` | `getDashboardStats` |
| Team | `GET/POST/DELETE .../team` | `ProjectsController` | `listTeam`, `addTeamMember`, `removeTeamMember` |
| Tasks | `.../schedule/tasks` | `ScheduleController` | `listTasks`, `createTask`, `updateTask` |
| RFIs | `.../rfis` | `RfisController` | `listRfis`, `createRfi`, ... |
| Documents | `/document-folders?...` | `DocumentFoldersController` | `listFolders` |

---

## Appendix A - Full frontend file list (PM)

```text
frontend/app/(dashboard)/projects/                          (16 route files)
frontend/app/(dashboard)/kanban-board/page.tsx
frontend/components/modules/projects/                         (30 components)
frontend/lib/query/projects.ts
frontend/lib/query/schedule.ts
frontend/lib/query/rfis.ts
frontend/lib/query/submittals.ts
frontend/lib/query/drawings.ts
frontend/lib/query/daily-logs.ts
frontend/lib/query/meetings.ts
frontend/lib/query/correspondence.ts
frontend/lib/query/risks.ts
frontend/lib/query/issues.ts
frontend/lib/query/punch-items.ts
frontend/lib/query/closeout.ts
frontend/lib/query/pm-query-utils.ts
frontend/lib/query/documents.ts                               (project folder)
frontend/lib/api/project-management.types.ts
frontend/lib/api/workflow.ts
frontend/lib/utils/project-display.ts
frontend/lib/utils/pm-status-display.ts
frontend/lib/utils/schedule-metrics.ts
frontend/lib/utils/portfolio-kanban.ts
frontend/lib/permissions/capabilities.ts
frontend/stores/project-context.store.ts
frontend/stores/auth.store.ts
frontend/hooks/useAuthHydrated.ts
frontend/hooks/useUserNameLookup.ts
```

## Appendix B - Full backend file list (PM module)

```text
backend/src/modules/project-management/
├── project-management.module.ts
├── application/
│   ├── dtos/pm.dtos.ts
│   ├── services/          (14 service files)
│   ├── types/pm-context.type.ts
│   └── utils/
│       ├── pm-mapper.util.ts
│       └── pm-pagination.util.ts
└── presentation/controllers/ (12 controller files)

backend/prisma/seed.ts          - permissions & roles
backend/prisma/seed-pm-demo.ts  - demo projects & sample data
```

## Appendix C - Local dev quick start (module-focused)

1. Seed database: `npm run prisma:seed --workspace=backend` (creates roles, DEMO-001…007 projects).
2. Login as admin or `pm@company.local`.
3. Open `/projects` → click `DEMO-001` → explore each tab.
4. Backend module path: `backend/src/modules/project-management/`.
5. Frontend components path: `frontend/components/modules/projects/`.

---

*This guide reflects the codebase as implemented. Placeholder areas (`/reports`, capability-driven tab hiding, async PM notifications) are noted explicitly so you know what is not built yet.*
