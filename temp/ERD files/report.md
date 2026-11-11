# ERP System - Project Management Module
## Progress Report
**Prepared:** 2026-06-25
**Module:** Project Management
**Status:** In Development

---

## 1. Executive Summary

The ERP system is a multi-tenant, construction-industry project management platform with a fully operational backend across twelve project management sub-modules (projects, schedule, RFIs, submittals, drawings, daily logs, meetings, correspondence, risks, issues, punch items, and closeout) and a deeply engineered EPC engineering design workflow. The backend is structurally complete: all major modules have service layers, controller endpoints, and database schemas. The most sophisticated component - the EPC design document approval workflow - is fully implemented end-to-end with a domain-layer state machine, a five-layer permission model, SLA tracking, and immutable audit trails. Immediate next steps are exposing the change request and deliverable service layers via controller endpoints, completing the frontend query layer for all modules, and hardening the Redis-backed asynchronous job path.

---

## 2. System Overview

### 2.1 What the system is

The system is a web-based ERP platform built for engineering, procurement, and construction (EPC) firms. It manages the full lifecycle of construction projects - from planning and scheduling through engineering design approval, field operations, and formal closeout. Users include project managers, site engineers, discipline-specific designers, reviewers, department chiefs, document controllers, safety officers, and external client consultants. The system enforces Chinese-standard engineering design governance workflows, including tiered review and formal submittal processes consistent with EPC project delivery methods.

### 2.2 Technology stack

- **Backend framework:** NestJS (Node.js + TypeScript) - provides modular, dependency-injected application structure.
- **Database:** PostgreSQL - stores all application data; Prisma is used as the ORM.
- **Frontend framework:** Next.js (TypeScript) - serves the user interface via a React-based SPA with server-side rendering capability.
- **Async job queue:** BullMQ (Redis-backed, optional) - processes workflow committed events and SLA escalation jobs asynchronously; falls back to synchronous execution when Redis is not enabled.
- **File storage:** MinIO/S3-compatible object storage (StorageModule) - stores all uploaded documents and engineering files.
- **Email:** MailModule (SMTP-backed) - delivers notifications and workflow alerts.
- **Auth:** JWT-based authentication with refresh tokens, password reset tokens, and optional MFA; rate limited via `@nestjs/throttler`.

### 2.3 Architecture overview

The frontend communicates with the backend via a REST API secured by JWT bearer tokens. The backend is organized into NestJS feature modules: `AuthModule`, `CompanySetupModule`, `UserManagementModule`, `AuditModule`, `NotificationsModule`, `DocumentsModule`, `ReportingModule`, and `ProjectManagementModule`. Each module exposes its own controllers and owns its service layer.

The `ProjectManagementModule` is the most complex: it contains 19 controllers and 55 providers (services, repositories, processors, and cron jobs). A `JwtAuthGuard` is applied globally; `PermissionsGuard` is applied per-controller and reads per-handler `@RequirePermission` decorators to enforce RBAC. Within the EPC design workflow, a second permission layer - `PermissionResolverService` + `canPerformFromContext()` - enforces five independent contextual checks before any EDV status transition is committed.

The database schema contains 73 models. PostgreSQL sequences (created at seed time via `CREATE SEQUENCE`) provide gap-free document numbers. All major entities use a soft-delete pattern (`deletedAt`/`deletedBy` fields) to preserve audit history. Two BullMQ queues (`workflow_committed` and `workflow_sla`) offload post-commit projection and SLA escalation work to Redis workers when Redis is enabled.

---

## 3. What Has Been Built

### 3.1 Module summary table

| Module | Status | Features built | Notes |
|--------|--------|----------------|-------|
| Projects | Complete | CRUD, team management, dashboard stats | Full controller + service |
| Schedule (Tasks, Milestones, Gantt) | Complete | Milestones CRUD, Tasks CRUD, Task Dependencies CRUD, Task Disciplines CRUD | Progress stored as integer on Task row |
| RFIs | Complete | CRUD, RFI responses | Status transitions via PATCH |
| Submittals | Partial | CRUD, design-package submittal, construction submittal, issue, batch-issue, batch-add-items, reviews, addReview | addReview updates status; updateSubmittal also updates status - dual write path |
| Drawings | Complete | CRUD, version history, drawing links | |
| Daily Logs | Complete | CRUD + child entries (workforce, equipment, visitors, incidents) | Status (DRAFT/SUBMITTED/APPROVED) updated via PATCH; no dedicated status-transition endpoint |
| Meetings | Complete | CRUD + agenda items, attendees, action items | All sub-resource write endpoints present |
| Correspondence | Complete | CRUD | |
| Risks | Complete | CRUD | Risk score stored as integer; categories include COST, SCHEDULE, SAFETY, QUALITY, ENVIRONMENTAL, CONTRACTUAL |
| Issues | Complete | CRUD | Six-status lifecycle; severity levels LOW/MEDIUM/HIGH/CRITICAL |
| Punch List | Complete | CRUD | Five-status lifecycle; severity levels MINOR/MAJOR/CRITICAL |
| Closeout | Partial | Get, initialize, update, checklist item toggle, warranty add/update/delete | No DELETE for the main Closeout record; Warranty model is fully implemented |
| EPC Engineering Design Workflow | Partial | Engineering documents CRUD + version upload + EDV status transitions; Design packages CRUD + dependency graph + full review lifecycle; Review comments lifecycle; Batch approve/return; Workspace views; Revision orchestration; SLA tracking; Decision trace | No controller for ProjectChangeRequest or Deliverable entities |

### 3.2 Feature detail - per module

#### Projects
- List projects with pagination and filtering
- Create, read, update, soft-delete a project
- Project fields include type (RESIDENTIAL/COMMERCIAL/INFRASTRUCTURE/INDUSTRIAL), status (PLANNING through CLOSED), budget, currency, design stage, commissioning method
- Set project team members (PUT replaces the full team membership list)
- List current team members
- Project dashboard stats endpoint (aggregated KPIs for the project view)

#### Schedule (Tasks, Milestones, Gantt)
- Full CRUD for Milestones
- Full CRUD for Tasks - fields include hierarchical parent-child relationships, dispatcher assignment, urgency level (NORMAL/URGENT/CRITICAL), language (CHINESE/ENGLISH), approval level (DEPARTMENT/INSTITUTE), progress percentage (stored as a single integer), critical path flag, and completion status tracking
- Full CRUD for Task Dependencies - four dependency types: FS (finish-to-start), SS (start-to-start), FF (finish-to-finish), SF (start-to-finish), with lag days
- Full CRUD for Task Disciplines - each discipline carries designer, reviewer, discipline lead, and chief engineer foreign keys; these keys drive EPC review governance
- Frontend utility `schedule-metrics.ts` computes actual vs. planned progress percentages and schedule variance from task date fields

#### RFIs
- List and paginate RFIs per project
- Create, read, update, soft-delete an RFI
- Status lifecycle: DRAFT → SUBMITTED → UNDER_REVIEW → ANSWERED → CLOSED (transitions via PATCH on `status` field)
- Priority levels: LOW / MEDIUM / HIGH / URGENT
- RFI responses: list and add text responses per RFI; responses are append-only (no update/delete endpoint)
- RFIs can be linked to a specific TaskDiscipline for EPC cross-referencing

#### Submittals
- List and paginate submittals per project
- Create generic submittal (direct status-field write)
- Create design-package submittal via `WorkflowKernel.CreateDesignSubmittal` - links design packages and captures EDV snapshots
- Create in-construction submittal with design packages and a document folder
- Submit in-construction submittal to discipline leader
- Issue a submittal - freezes snapshot payloads via `SubmittalSnapshotService`
- Batch-issue multiple submittals; batch-add items to multiple DRAFT submittals
- Add design package items to a DRAFT submittal
- Add a review record (`addReview` - sets `SubmittalReview` row and updates parent status to the review's outcome status)
- Update submittal via PATCH (also updates status field directly - dual write path for status)
- Submittal purpose options include: IN_CONSTRUCTION, DISCIPLINE_SITE, DISCIPLINE_CONSULTANT, DEPUTY_BID, DEPUTY_INTERIM, DEPUTY_FINAL
- `SubmittalItem` captures a frozen snapshot (`snapshotPayload` JSON, `contentHash`) of the EDV state at issue time

#### Drawings
- List and paginate drawings per project
- Create, read, update, soft-delete a drawing
- Drawing fields include drawing number, discipline, revision, status (free string with default "CURRENT"), isLatest flag
- List drawing versions (DrawingVersion rows with file keys and revision labels)
- Create and delete drawing links (polymorphic links to other entities by `linkedEntityType` + `linkedEntityId`)

#### Daily Logs
- List daily logs per project with date filtering
- Create a daily log - fields include log date, shift, weather condition, temperature, rainfall, and work summary
- Update a daily log header
- Soft-delete a daily log
- Child resource management (all cascade-delete on parent delete):
  - Add/remove workforce entries (trade, contractor, worker count)
  - Add/remove equipment entries (type, quantity, hours used, hours downtime)
  - Add/remove visitor entries (name, company, purpose)
  - Add/remove incident entries (type, description, severity)
- Status field (DRAFT/SUBMITTED/APPROVED) updated via PATCH on the header; no dedicated transition endpoint

#### Meetings
- List and paginate meetings per project
- Create, read, update, soft-delete a meeting
- Meeting types: PROGRESS, DESIGN_COORDINATION, SAFETY, CLIENT
- Status lifecycle: SCHEDULED → CONDUCTED → MINUTES_ISSUED → CLOSED (via PATCH)
- Full sub-resource management: agenda items (add/update/delete with presenter, topic, notes, decisions), attendees (add/update/delete with internal user or external name/organization), action items (add/update/delete with owner, due date, status)

#### Correspondence
- List and paginate correspondence per project
- Create, read, update, soft-delete a correspondence record
- Types: LETTER, EMAIL, NOTICE, INSTRUCTION, MEMO
- Status lifecycle: DRAFT → SENT → ACKNOWLEDGED → CLOSED (via PATCH)
- Reference number field; sender and recipient stored as name strings (not FK-only)

#### Risks
- List and paginate risks per project
- Create, read, update, soft-delete a risk
- Fields include probability (1–5 integer), impact (1–5 integer), computed risk score (stored as integer), mitigation plan, contingency plan, review date
- Categories: COST, SCHEDULE, SAFETY, QUALITY, ENVIRONMENTAL, CONTRACTUAL
- Status lifecycle: OPEN → MONITORING → MITIGATED → CLOSED (via PATCH)
- Owner is a required FK to User

#### Issues
- List and paginate issues per project
- Create, read, update, soft-delete an issue
- Severity: LOW, MEDIUM, HIGH, CRITICAL
- Status lifecycle: OPEN → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED → CLOSED (via PATCH)
- Issues can be linked to a TaskDiscipline for EPC cross-referencing
- Raiser and optional assignee are User FKs

#### Punch List
- List and paginate punch items per project
- Create, read, update, soft-delete a punch item
- Severity: MINOR, MAJOR, CRITICAL
- Status lifecycle: RAISED → ASSIGNED → CORRECTED → VERIFIED → CLOSED (via PATCH)
- Fields include room/area location and trade responsible

#### Closeout
- Initialize project closeout (one-per-project, enforced by unique FK)
- Read closeout with checklist items and warranty records
- Update closeout header - fields include practical completion date, defects liability end date, final completion date, financial summary (contract value, variations, claims, final settlement)
- Status lifecycle: PRACTICAL_COMPLETION → DEFECTS_LIABILITY_PERIOD → FINAL_COMPLETION → FINANCIAL_CLOSEOUT → ARCHIVE (via PATCH)
- Toggle closeout checklist items (category, description, isComplete, completedAt, verifiedBy)
- Add, update, remove warranty records (supplier, start date, expiry date)
- No DELETE endpoint for the root Closeout record itself; warranties can be individually deleted

#### EPC Engineering Design Workflow
- **Engineering documents:** Register an uploaded file as a new EngineeringDocument + Rev-0 EngineeringDocumentVersion; list documents for a discipline; get a single document; update metadata; soft-delete; upload a new version (creates new EDV row); update EDV revision label; transition EDV status via WorkflowKernel; list workflow event log per EDV
- **EDV status machine:** Five statuses - DRAFT, IN_REVIEW, APPROVED, LOCKED, SUPERSEDED - with explicit allowed transitions enforced in `edv-state-machine.ts`. LOCKED and SUPERSEDED are terminal and immutable. Every transition is validated in `StatusWriteGateService` before being persisted.
- **Design packages:** CRUD; add/remove EDV items; create/delete package dependencies (FINISH_TO_START or COORDINATION_ONLY); submit package for review (opens ReviewSession, captures context snapshot); approve session at current tier; return package for rework (closes session, reverts EDVs to DRAFT); batch-approve EDVs (DEPT_CHIEF tier only); batch-return EDVs; lock all package EDVs (APPROVED → LOCKED); batch-lock multiple packages
- **Review sessions:** Opened by SubmitPackageForReview, progresses through four tiers - DISCIPLINE_OWNER → REVIEWER → DISCIPLINE_LEAD → DEPT_CHIEF. Session carries SLA deadline, `slaDeadlineAt`, and `slaEscalatedAt` timestamps. Admin reassignment of active session assignee is available (system admin or managing director only).
- **Review comments:** Add to any EDV within an active session; update own OPEN comment; transition comment status (OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED → VERIFIED → CLOSED) with actor-role enforcement; verify a RESOLVED comment (reviewer role); remove own OPEN comment. All comments must be VERIFIED or CLOSED before session can be approved (`DefinitionOfDoneService`).
- **Comment routing:** `ReviewRoutingService` routes by severity - MINOR stays at current tier; MODERATE escalates from DISCIPLINE_OWNER to REVIEWER; MAJOR escalates one tier up the chain.
- **Review context snapshot:** `ReviewContextSnapshot` captures the set of EDV IDs and a content hash at the moment a package is submitted for review, providing a frozen reference for the review session.
- **Revision orchestration:** `RevisionOrchestratorService.triggerRevision()` creates a new DRAFT EDV from the latest LOCKED source; any non-LOCKED, non-SUPERSEDED existing versions are moved to SUPERSEDED. This enforces the linear lockstep rule: only one active draft per document at a time.
- **External review triggers:** `ExternalReviewTrigger` records created from RFIs, change requests, or submittal reviews are processed via `POST /projects/:projectId/revision-triggers/:triggerId/process`, spawning one new DRAFT EDV per document referenced in the trigger's submittal snapshots.
- **Workspace views:** Review inbox (sessions assigned to current user), open comments assigned to current user, project status board KPIs, dispatcher workload/bottleneck view, review mode payload for a package, EDV version history with workflow events
- **SLA escalation:** `ReviewSlaService` checks for overdue active sessions on a cron schedule; marks them with `slaEscalatedAt`; sends in-app or email notification to the project manager. SLA limits: DISCIPLINE_OWNER 24 h, REVIEWER 48 h, DISCIPLINE_LEAD 72 h, DEPT_CHIEF 120 h. SLA is visibility-only - it never blocks workflow or automatically reassigns.
- **Decision trace:** `DecisionTraceService` builds a lineage graph for an engineering document, showing which review sessions, approvals, and revisions led to the current state.
- **Workflow event log:** Every EDV status transition, review session event, and comment state change is written to `WorkflowEventLog` with INTENT/COMMITTED/CORRECTION phases, before/after state JSON, actor ID, and correlation ID.
- **Idempotency:** `WorkflowKernelService.execute()` checks for prior INTENT events matching an `idempotencyKey` before executing; if found, replays the last known result without re-executing the command.

---

## 4. Workflow Logic Implemented

### 4.1 EPC design document approval loop

The approval loop is enforced entirely in code - not on the honour system. The sequence is:

1. **Upload:** A designer uploads a file to object storage via the documents module. They register it via `POST …/engineering-documents/register`, which creates an `EngineeringDocument` and Rev-0 `EngineeringDocumentVersion` in status DRAFT.
2. **Package:** The designer creates a `DesignPackage` and adds EDVs to it. A package can have cross-package FINISH_TO_START or COORDINATION_ONLY dependencies.
3. **Submit for review:** `POST …/design-packages/:packageId/submit-for-review` calls `WorkflowKernelService.execute(SubmitPackageForReview)`. This opens a `ReviewSession` at tier `DISCIPLINE_OWNER`, assigns the session to the discipline owner FK from the `TaskDiscipline` row, and captures a `ReviewContextSnapshot` (frozen EDV ID list + content hash). EDV statuses are moved from DRAFT to IN_REVIEW.
4. **Review tiers - four tiers enforced in order:**
   - **DISCIPLINE_OWNER** (24 h SLA): Reviews documents; adds `ReviewComment` records with severity MINOR, MODERATE, or MAJOR.
   - **REVIEWER** (48 h SLA): MODERATE and MAJOR comments escalate here via `ReviewRoutingService.route()`.
   - **DISCIPLINE_LEAD** (72 h SLA): MAJOR comments escalate here.
   - **DEPT_CHIEF** (120 h SLA): Final governance tier. Only at this tier is `BatchApproveEdvs` allowed.
5. **Comment lifecycle enforcement:** Before session approval, `DefinitionOfDoneService.assertPackageApprovalAllowed()` calls `canApprovePackage()` from `comment-state-machine.ts`, which blocks if any comment is in status OPEN, ACKNOWLEDGED, IN_PROGRESS, or RESOLVED. All comments must be VERIFIED or CLOSED.
6. **Approve:** `POST …/review-sessions/:reviewSessionId/approve` calls `WorkflowKernelService.execute(ApproveReviewSession)`. If the current tier is not DEPT_CHIEF, the session advances to the next tier and is reassigned. At DEPT_CHIEF, `BatchApproveEdvs` moves all IN_REVIEW EDVs to APPROVED.
7. **Lock:** `POST …/design-packages/:packageId/lock-edvs` moves all APPROVED EDVs to LOCKED. LOCKED is a terminal status - the state machine in `edv-state-machine.ts` returns `LOCKED_IMMUTABLE` for any further transition attempt.
8. **Return for rework:** At any tier, `ReturnPackageForRework` closes the session, sets its outcome to RETURNED_FOR_REWORK, and transitions all IN_REVIEW EDVs back to DRAFT.
9. **Revision loop:** When an external trigger (RFI, change request, submittal review) requires changes to a LOCKED document, `RevisionOrchestratorService.triggerRevision()` creates a new DRAFT EDV referencing the same base document. The LOCKED source is untouched. Any non-LOCKED, non-SUPERSEDED prior versions are moved to SUPERSEDED. The lockstep rule (`validateNewRevisionUpload`) blocks creation if an active DRAFT already exists.
10. **Audit trail:** Every status transition writes a `WorkflowEventLog` row with `phase: INTENT`, before/after state, actor, and correlation ID. A second pass (via `WorkflowCommittedService` - async or sync) writes the `COMMITTED` phase event. Corrections can be appended via `POST /workflow-events/:eventId/correct` with a reason.
11. **State projection:** After every Phase A write, `StateProjectionService.recomputeDirtyInTx()` recalculates `projectedStatus` on the affected `DesignPackage` and `TaskDiscipline` rows (IN_PROGRESS / PENDING_LEAD / APPROVED / REWORK_REQUIRED), making dashboard KPIs eventually consistent within the same transaction.

### 4.2 Project lifecycle

Projects move through statuses PLANNING → TENDER → MOBILIZATION → ACTIVE → ON_HOLD → COMPLETED → CLOSED. Transitions are via PATCH on the `status` field; no state machine enforces transition order at the backend (all statuses can be set freely). Team membership is managed separately via `PUT /projects/:projectId/team`, which replaces the full team list. Child entities (tasks, RFIs, submittals, etc.) require a valid project team membership check in `ProjectScopeService.getProjectOrThrow()` - a user not on the team receives a 404 on all project child resources, even if they have the system-level RBAC permission.

### 4.3 Task lifecycle

Tasks are created with status NOT_STARTED. Status transitions (NOT_STARTED → IN_PROGRESS → DELAYED → COMPLETED) are via PATCH on the `status` field; no backend state machine enforces ordering. Progress is stored as an integer (0–100) on the `Task` row - there is no per-discipline or per-subtask progress aggregation server-side. Parent-child task hierarchies are supported via `parentTaskId`. The `schedule-metrics.ts` frontend utility derives planned progress percentage from task start and finish dates against today's date, and schedule variance from the gap between actual and planned progress.

### 4.4 RFI lifecycle

RFIs move through DRAFT → SUBMITTED → UNDER_REVIEW → ANSWERED → CLOSED via PATCH on the `status` field. Responses are added as append-only `RfiResponse` records. An RFI can optionally be linked to a `TaskDiscipline` to trigger a design revision via `ExternalReviewTrigger`. Priority levels are set at creation and can be updated via PATCH.

### 4.5 Submittal approval flow

Two distinct paths exist:

**Generic submittal (`POST /submittals`):** Creates a submittal and sets status via the request body. All status transitions (DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / APPROVED_WITH_COMMENTS / REVISE_AND_RESUBMIT / REJECTED) are via PATCH on the `status` field.

**Design-package submittal (`POST /submittals/design-package` + `POST /:id/issue`):** Creates a DRAFT submittal linked to design packages via `WorkflowKernel.CreateDesignSubmittal`. Issuing it (`IssueSubmittal`) freezes snapshots: `SubmittalSnapshotService` reads the current APPROVED/LOCKED EDV state for each linked design package and stores it as an immutable JSON payload on each `SubmittalItem`. The `contentHash` ensures tamper detectability. After issue, external review triggers can create new draft revisions on affected documents.

`addReview` adds a `SubmittalReview` record and updates the parent `Submittal.status` to the review's outcome status. `updateSubmittal` (PATCH) also accepts a status field, creating a dual write path for status - both paths write directly to the database without a state machine guard on the Submittal entity itself.

### 4.6 Issue lifecycle

Issues move through OPEN → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED → CLOSED via PATCH. Severity is set at creation. Raiser and assignee are tracked separately. `resolvedAt` and `verifiedAt` timestamps are stored for SLA measurement. Issues can optionally link to a TaskDiscipline for EPC context.

---

## 5. Role and Permission System

### 5.1 Roles defined

26 system roles are seeded at bootstrap. The following table covers their project management access profile as defined in `seed.ts`.

| Role | Modules with write access | Real-world responsibility |
|------|--------------------------|--------------------------|
| System Administrator | All modules, full access | Platform administration |
| Managing Director | All PM modules, full access | Executive oversight |
| Project Manager | All PM modules, full access | Owns project delivery |
| Site Engineer | projects, schedule, rfis, submittals, daily_logs, issues, punch_items, risks (view/create/edit) | Field execution and reporting |
| Document Controller | projects, submittals, drawings, correspondence (view/create/edit); documents full | Document control and archiving |
| Safety Officer | projects, risks, issues, daily_logs, meetings, punch_items (view/create/edit) | Safety compliance monitoring |
| Project Director | All PM modules, full access; design workflow access | Senior design management |
| General Manager | projects, schedule, rfis, risks, issues, meetings, correspondence (view/create/edit) | Executive project oversight |
| Planning Engineer | projects, schedule (view/create/edit) | Schedule and planning |
| Chief Engineer | projects, schedule, drawings, submittals, rfis (view/create/edit) | Technical engineering lead |
| Designer | projects, schedule, drawings (view/create/edit); EPC upload rights | Engineering design production |
| Dispatcher | projects, schedule, issues (view/create/edit) | Task dispatch coordination |
| Discipline Owner | projects, schedule, drawings (view/create/edit); canApprove on schedule | EPC design ownership and review initiation |
| Reviewer | projects, schedule, drawings (view/create/edit); canApprove on schedule | Peer review of engineering documents |
| Discipline Lead | projects, schedule, drawings, submittals (view/create/edit); canApprove | Lead sign-off on discipline packages |
| Department Chief | projects, schedule, drawings, submittals (view/create/edit/approve) | Department-level governance approval |
| Deputy Chief | projects, schedule, drawings, submittals (view/create/edit/approve) | Deputy governance approval |
| Site Coordinator | projects, schedule, rfis, issues, submittals, daily_logs (view/create/edit) | On-site coordination |
| Client Consultant | projects (view), rfis (view/create/edit), issues (view/create) | External client-side review |
| Employee | All PM modules read-only; company/notifications/documents read | General staff visibility |
| Finance Manager, Accountant, Procurement Officer, Storekeeper, HR Officer, Institute Chief | No PM module write access in seed | Non-PM roles |

### 5.2 How permissions are enforced

**`PermissionsGuard`** is applied globally to all controllers that use `@UseGuards(PermissionsGuard)`. It reads the `@RequirePermission(module, action)` decorator from the route handler, then calls `PermissionService.hasPermission(userId, companyId, module, action)` which queries the `RolePermission` table. The check resolves the user's active roles (via `UserRole`) and returns true if any role has the required flag (`canView`, `canCreate`, `canEdit`, `canDelete`, `canApprove`, or `canExport`) set to true for the given module/action combination.

**`ProjectScopeService.getProjectOrThrow(ctx, projectId)`** adds a second check beyond RBAC: it verifies the user has an active `ProjectTeam` membership for the requested project. This ensures a system-level PM role cannot access a project they have not been added to. Users who fail this check receive 404 (not 403), which prevents information leakage about project existence.

### 5.3 EPC-specific permission model

The EPC workflow uses a five-layer permission model evaluated in `permission-context-builder.ts` via `canPerformFromContext()`. All five layers must pass (deny wins).

1. **System role layer:** Checks whether the user's RBAC grants the required `EpcWorkflowAction`. Actions map to the `schedule` module permission flags (canCreate, canEdit, canApprove, canView). Example: `REVIEW_SESSION_APPROVE` requires `schedule.canApprove`.
2. **Project team membership layer:** For most actions (upload, lock, submit, revision), the user must be on the project team. Review governance actions (approve, verify comments) bypass this layer because they are authorized by discipline FKs.
3. **Discipline assignment layer:** The user must be the specific FK holder for the action. For design actions (upload, submit, revision trigger), the user must match `designerUserId`. For lock, the user must match `chiefUserId`. For review actions (approve, verify, batch), the user must match one of: `ownerUserId`, `reviewerUserId`, `disciplineLeadUserId`, `chiefUserId`, or `currentAssigneeUserId` (the review session assignee).
4. **Project design phase layer:** Certain actions are blocked in specific project phases. Submittal creation and issuance are blocked in INITIATION, PLANNING, CONCEPT_DESIGN, SCHEMATIC, and DETAILED_DESIGN phases. EDV upload is blocked in the CLOSEOUT phase.
5. **Workflow state layer:** Actions are gated on the current EDV status. For example, comments can only be assigned on EDVs in IN_REVIEW or APPROVED status; LOCKED and SUPERSEDED EDVs reject all comment attempts.

---

## 6. Database

### 6.1 Entity count

73 models are defined in `schema.prisma`.

### 6.2 Key entities and relationships

**Organization domain:**
- `Company` - top-level tenant
- `Branch` - physical office within a company
- `Division` - organisational division
- `Department` - department within a division and branch
- `CostCentre` - cost centre linked to a department
- `Position` - job title within a department
- `CompanySetting` - key-value configuration per company

**Identity and access:**
- `User` - platform user with email, password hash, MFA flag, and preferences; belongs to company, branch, department, position
- `UserSession` - JWT refresh token sessions (hashed); tracks device info and IP
- `PasswordResetToken` - time-limited reset tokens (hashed)
- `EmailVerificationToken` - email verification and change tokens (hashed)
- `Role` - RBAC role with optional parent for inheritance; `isSystemRole` flag
- `UserRole` - many-to-many user-to-role assignment with data scope entries
- `Permission` - module + action pair (global, not per-tenant)
- `RolePermission` - per-role, per-permission flag matrix (canView, canCreate, canEdit, canDelete, canApprove, canExport)
- `DataScope` - scopes a user-role assignment to a specific branch/department/project

**Audit and notifications:**
- `AuditLog` - structured record of every user action with before/after JSON and correlation ID
- `NotificationTemplate` - per-company, per-channel event templates
- `Notification` - individual notification delivery records
- `NotificationPreference` - per-user, per-event channel opt-in settings

**Documents and financials:**
- `DocumentFolder` - hierarchical folder tree with context types (PROJECT, RFI, SUBMITTAL, etc.)
- `Document` - file metadata with version tracking flag
- `DocumentVersion` - each uploaded revision of a document with file key and change note
- `DocumentAccess` - per-role, per-folder access control (canView, canUpload, canDownload, canDelete)
- `ReportDefinition`, `ReportSchedule`, `DashboardWidget` - reporting and dashboard configuration
- `FinancialYear`, `FinancialPeriod`, `NumberSeries` - financial calendar and document sequencing

**Project management core:**
- `Project` - top-level project with type, status, dates, budget, and design metadata
- `ProjectTeam` - user-to-project membership (soft-deleted; used as access gate)
- `Milestone` - schedule milestone with planned and actual dates
- `Task` - schedule task with hierarchy, discipline grouping, progress integer, and status
- `TaskDependency` - FS/SS/FF/SF dependency with lag days

**EPC design workflow:**
- `TaskDiscipline` - discipline within a task; holds designer, reviewer, lead, chief, owner user FKs; drives EPC review governance
- `EngineeringDocument` - logical document (drawing, report, calculation, etc.) within a discipline
- `EngineeringDocumentVersion` - specific revision of a document; holds EDV status (DRAFT → IN_REVIEW → APPROVED → LOCKED / SUPERSEDED) and revision label
- `DesignPackage` - grouping of EDVs for review; carries projected status
- `DesignPackageItem` - join table linking a design package to specific EDVs
- `DesignPackageDependency` - dependency relationship between packages
- `ReviewSession` - one active review session per design package per tier advancement; tracks current tier, SLA deadline, and assignee
- `ReviewContextSnapshot` - frozen EDV ID list and content hash at submission time; prevents reviewers from seeing documents not in the review scope
- `ReviewComment` - comment on a specific EDV within a review session; with severity, status, assignee, and optional attached document versions
- `WorkflowEventLog` - immutable append-only audit trail for all EPC workflow state changes; three phases: INTENT, COMMITTED, CORRECTION
- `TaskDisciplineReview` - per-tier review record for a discipline (PENDING / IN_REVIEW / APPROVED / RETURNED)

**Construction operations:**
- `Rfi` - Request for Information with priority, status, assignee, and due date
- `RfiResponse` - append-only responses to an RFI
- `Submittal` - formal submittal with purpose, prepared-by role, and status
- `SubmittalReview` - review record per revision of a submittal
- `SubmittalItem` - design package linked to a submittal with frozen snapshot payload
- `ExternalReviewTrigger` - trigger from RFI, change request, or submittal review to initiate EDV revision loop
- `ProjectChangeRequest` - formal change request linked to an external trigger source
- `Deliverable` - planned deliverable linked optionally to a discipline, package, or engineering document

**Field operations:**
- `Drawing` - drawing register entry with revision and isLatest flag
- `DrawingVersion` - file versions for a drawing
- `DrawingLink` - polymorphic link from a drawing to any other entity
- `DailyLog` - site daily log with weather, work summary, and status
- `DailyLogWorkforce`, `DailyLogEquipment`, `DailyLogVisitor`, `DailyLogIncident` - child line items (cascade-deleted with parent)
- `Meeting` - project meeting with type and status
- `MeetingAgendaItem`, `MeetingAttendee`, `ActionItem` - meeting sub-records
- `Correspondence` - formal correspondence log (letters, emails, notices, instructions, memos)
- `Risk` - risk register entry with probability, impact, score, and mitigation plans
- `Issue` - site or design issue with severity lifecycle
- `PunchItem` - closeout punch list item with severity lifecycle
- `Closeout` - one-per-project closeout record with financial summary
- `CloseoutChecklistItem` - individual checklist items within a closeout
- `Warranty` - warranty records within a closeout

### 6.3 Data integrity features

- **Soft delete:** All major entities carry `deletedAt` / `deletedBy` fields. Queries use an `activeOnly()` helper to filter soft-deleted records. Hard deletes are only used for session-scoped child records (daily log children use `onDelete: Cascade`).
- **PostgreSQL sequences:** Document numbers for PURCHASE_ORDER, INVOICE, RFI, SUBMITTAL, ISSUE, PUNCH_ITEM, MEETING, CORRESPONDENCE, and TASK are generated via `CREATE SEQUENCE` commands at seed time, referenced via `NumberSeries.sequenceName`. This prevents race conditions and gaps that would occur with application-level `MAX(+1)` counters.
- **Unique constraints:** Enforce single active draft per EDV revision label (`uq_edv_document_revision_label`), one user per role (`uq_user_role_user_role`), one submittal item per submittal+package pair (`uq_submittal_item_submittal_package`), one project per code within a company (`uq_project_company_code`), one setting per company/module/key, and many others.
- **Indexes:** Every FK and common filter column is indexed. Critical composite indexes include `idx_workflow_event_log_entity` (entityType + entityId), `idx_review_session_sla_deadline_at` (for SLA cron queries), and `idx_task_project_deleted` (for soft-delete aware task fetches).
- **Content hashing:** `SubmittalItem.contentHash` and `ReviewContextSnapshot.contentHash` detect if snapshot payload integrity has been compromised.

---

## 7. Engineering Decisions

- **Why NestJS module architecture:** NestJS's decorator-driven DI system makes each module's dependency surface explicit and testable in isolation; the module boundary between `ProjectManagementModule` and shared infrastructure (`PrismaModule`, `PermissionsModule`, `StorageModule`) means the project management domain can be extracted or versioned without touching auth or company setup.

- **Why the EPC workflow uses a domain-layer state machine instead of a free status field:** A free status field (as used for tasks, RFIs, risks) would allow any caller to set any status value. The `EdvStatus` state machine in `edv-state-machine.ts` makes invalid transitions structurally impossible before they reach the database. `StatusWriteGateService.assertTransition()` is called inside the transaction in `EdvTransitionService.applyInTx()`, so no database write can succeed for a prohibited transition even if the HTTP layer is bypassed.

- **Why PostgreSQL sequences are used for document numbers instead of application-level counters:** Application-level `MAX(id)+1` logic is subject to race conditions under concurrent writes. Native PostgreSQL sequences (`nextval()`) are atomic and gap-tolerant under concurrent load, guaranteeing uniqueness without locking.

- **Why BullMQ is used for async jobs:** Two post-commit operations - writing COMMITTED phase workflow events and computing SLA escalations - are non-blocking and do not affect the HTTP response. Decoupling them via BullMQ (with Redis) prevents slow notification dispatch from adding latency to the synchronous workflow path. The system degrades gracefully: when `REDIS_ENABLED=false`, both operations run synchronously within the same request cycle.

- **Why the EPC permission system uses five independent layers instead of a single role check:** Each layer guards a different attack surface. RBAC alone would allow any global Reviewer to review any project's documents. The project team membership layer restricts to assigned projects. The discipline assignment layer restricts to the specific discipline. The design phase layer enforces lifecycle gates (e.g., no submittals during design phases). The workflow state layer prevents commenting on LOCKED documents. All five must pass; relaxing any one would create a governance gap.

- **Why task progress is stored as a single integer on the Task row:** This keeps task queries simple (no aggregation) and matches the source data model - in this EPC context, progress is self-reported by the task owner at a single granularity. The trade-off is that there is no server-enforced rollup from child tasks or discipline-level progress to the parent task or project-level `overallProgressPct`; both are updated independently via PATCH.

- **Why the EPC revision loop creates a new DRAFT rather than mutating the existing LOCKED document:** LOCKED status is the system's contract that a document version is final and tamper-proof. Mutating a LOCKED EDV would invalidate any submittal snapshots that reference it by ID. Creating a new DRAFT revision preserves the LOCKED version as an immutable historical record while giving the designer a clean working copy, and the `RevisionOrchestratorService` explicitly rejects any trigger if no LOCKED source exists.

---

## 8. What Is Not Yet Complete

### 8.1 Missing controller endpoints (service built, not yet exposed)

- **`ProjectChangeRequestService`** - registered as a provider in the module but has no controller. Change request creation, listing, updating, and approval are not reachable via HTTP.
- **`ExternalReviewTriggerService`** - `processExternalReviewTrigger` is exposed via `EngineeringBatchController`, but no GET list endpoint exists for querying pending triggers per project.
- **`ReviewContextSnapshotService`** - snapshot is created internally during `SubmitPackageForReview`; no read endpoint exists to fetch a session's snapshot payload for display.
- **`DependencyGraphService`** - a service for computing the design package dependency graph is registered but has no dedicated GET endpoint.
- **`StateProjectionService`** - internal recomputation; no endpoint to force a projection recalculation outside of a workflow mutation.

### 8.2 Schema-only models (no service or API)

- **`Deliverable`** - model is fully defined in schema with status (PLANNED / IN_PROGRESS / SUBMITTED / APPROVED / WAIVED) and FK links to discipline, package, and engineering document, but no `DeliverableService` or controller is registered in the module.
- **`TaskDisciplineReview`** - per-tier review records are defined in schema and the `TaskDisciplineReviewStatus` enum (PENDING / IN_REVIEW / APPROVED / RETURNED) is declared, but no service reads or writes to this table via the API.

### 8.3 Known gaps to address

1. The `ProjectChangeRequest` entity has a complete schema and service but is not accessible via any HTTP endpoint.
2. The `Deliverable` entity has a complete schema but no service or API - deliverable tracking is not functional.
3. Submittal status has two independent write paths (addReview and updateSubmittal PATCH), which could cause conflicting status values with no state machine guard.
4. DailyLog status progression (DRAFT → SUBMITTED → APPROVED) has no dedicated transition endpoint; status changes piggyback on the general PATCH update.
5. The root `Closeout` record cannot be deleted - only warranties can be removed individually.
6. No GET endpoint for listing a project's active `ExternalReviewTrigger` records; operators cannot query the trigger queue without direct database access.
7. No GET endpoint for listing `ReviewSession` records at the project or discipline level directly; sessions are accessible only through design package detail responses.
8. The `TaskDisciplineReview` per-tier tracking table is never written to by any current service, meaning tier-level review history is tracked only in `WorkflowEventLog` rather than in the dedicated structured table.

---

## 9. Next Steps

### Immediate (before next review)
1. Add a `ProjectChangeRequestController` to expose the existing `ProjectChangeRequestService` via HTTP (list, create, update, approve/reject).
2. Add a `GET /projects/:projectId/external-review-triggers` endpoint to query pending trigger records.
3. Add a `DeliverableService` and controller with CRUD for the existing Deliverable schema.
4. Audit the dual submittal status write path (addReview vs. PATCH) and decide whether to introduce a state machine guard or explicitly document the merge rule.
5. Add a GET endpoint to list `ReviewSession` records at the discipline level.

### Short term (next sprint)
1. Write to `TaskDisciplineReview` from the review workflow - populate PENDING → IN_REVIEW → APPROVED / RETURNED per tier as sessions advance.
2. Add a dedicated daily log status transition endpoint (or ensure the PATCH DTO enforces valid status progression).
3. Add a DELETE endpoint for the root `Closeout` record.
4. Implement a read endpoint for `ReviewContextSnapshot` per session.
5. Add a project-level GET endpoint for `Deliverable` items grouped by discipline or package.
6. Frontend: complete query layer for modules where React Query hooks are still missing (verify against `frontend/lib/query/` coverage).
7. Implement BullMQ worker health-check and alerting for when the Redis-backed queue falls behind.
8. Add pagination to workflow event log endpoints.

### Planned (later phase)
1. Subcontractor management module (subcontract register, payment schedules, performance tracking).
2. Client portal - scoped read-only access for external client users to view project dashboards, RFIs, and submittal status.
3. Budgeting and cost control module - link cost centres to tasks and submittals; track actual vs. planned spend.
4. Advanced reporting - scheduled PDF/Excel exports from `ReportDefinition` + `ReportSchedule`; populated dashboard widgets per role.
5. Full mobile/PWA support for site engineers to submit daily logs and punch items from the field.

---

## 10. Appendix - Full API Surface

### Projects - `projects.controller.ts`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | /projects | projects.view | List projects |
| GET | /projects/:projectId/dashboard | projects.view | Project dashboard stats |
| GET | /projects/:projectId/team | projects.view | List project team members |
| PUT | /projects/:projectId/team | projects.edit | Replace project team members |
| GET | /projects/:id | projects.view | Get project by ID |
| POST | /projects | projects.create | Create project |
| PATCH | /projects/:id | projects.edit | Update project |
| DELETE | /projects/:id | projects.delete | Soft-delete project |

### Schedule - `schedule.controller.ts`
Base: `/projects/:projectId/schedule`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | /milestones | schedule.view | List milestones |
| POST | /milestones | schedule.create | Create milestone |
| PATCH | /milestones/:id | schedule.edit | Update milestone |
| DELETE | /milestones/:id | schedule.delete | Delete milestone |
| GET | /tasks | schedule.view | List tasks |
| POST | /tasks | schedule.create | Create task |
| PATCH | /tasks/:id | schedule.edit | Update task |
| DELETE | /tasks/:id | schedule.delete | Delete task |
| GET | /disciplines | schedule.view | List all project disciplines |
| GET | /disciplines/:disciplineId | schedule.view | Get discipline by ID |
| GET | /tasks/:taskId/disciplines | schedule.view | List disciplines for task |
| POST | /tasks/:taskId/disciplines | schedule.create | Create task discipline |
| PATCH | /tasks/:taskId/disciplines/:disciplineId | schedule.edit | Update task discipline |
| DELETE | /tasks/:taskId/disciplines/:disciplineId | schedule.delete | Delete task discipline |
| GET | /task-dependencies | schedule.view | List task dependencies |
| POST | /task-dependencies | schedule.create | Create task dependency |
| PATCH | /task-dependencies/:id | schedule.edit | Update task dependency |
| DELETE | /task-dependencies/:id | schedule.delete | Delete task dependency |

### RFIs - `rfis.controller.ts`
Base: `/projects/:projectId/rfis`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | / | rfis.view | List RFIs |
| GET | /:rfiId | rfis.view | Get RFI by ID |
| POST | / | rfis.create | Create RFI |
| PATCH | /:rfiId | rfis.edit | Update RFI |
| DELETE | /:rfiId | rfis.delete | Delete RFI |
| GET | /:rfiId/responses | rfis.view | List RFI responses |
| POST | /:rfiId/responses | rfis.create | Add RFI response |

### Submittals - `submittals.controller.ts`
Base: `/projects/:projectId/submittals`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | / | submittals.view | List submittals |
| POST | / | submittals.create | Create generic submittal |
| POST | /design-package | submittals.create | Create design-package submittal (DRAFT) |
| POST | /construction | submittals.create | Create in-construction submittal |
| POST | /batch-issue | submittals.create | Issue multiple submittals |
| POST | /batch-add-items | submittals.edit | Add packages to multiple DRAFT submittals |
| POST | /:id/submit-to-lead | submittals.create | Submit to discipline leader |
| POST | /:id/issue | submittals.create | Issue submittal and freeze snapshots |
| POST | /:id/items | submittals.edit | Add design packages to DRAFT submittal |
| GET | /:id/reviews | submittals.view | List submittal reviews |
| POST | /:id/reviews | submittals.create | Add submittal review |
| GET | /:id | submittals.view | Get submittal by ID |
| PATCH | /:id | submittals.edit | Update submittal |
| DELETE | /:id | submittals.delete | Delete submittal |

### Drawings - `drawings.controller.ts`
Base: `/projects/:projectId/drawings`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | / | drawings.view | List drawings |
| POST | / | drawings.create | Create drawing |
| GET | /:id/versions | drawings.view | List drawing versions |
| GET | /:id/links | drawings.view | List drawing links |
| POST | /:id/links | drawings.create | Create drawing link |
| DELETE | /:id/links/:linkId | drawings.delete | Delete drawing link |
| GET | /:id | drawings.view | Get drawing by ID |
| PATCH | /:id | drawings.edit | Update drawing |
| DELETE | /:id | drawings.delete | Delete drawing |

### Daily Logs - `daily-logs.controller.ts`
Base: `/projects/:projectId/daily-logs`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | / | daily_logs.view | List daily logs |
| POST | / | daily_logs.create | Create daily log |
| POST | /:id/workforce | daily_logs.create | Add workforce entry |
| DELETE | /:id/workforce/:workforceId | daily_logs.edit | Remove workforce entry |
| POST | /:id/equipment | daily_logs.create | Add equipment entry |
| DELETE | /:id/equipment/:equipmentId | daily_logs.edit | Remove equipment entry |
| POST | /:id/visitors | daily_logs.create | Add visitor entry |
| DELETE | /:id/visitors/:visitorId | daily_logs.edit | Remove visitor entry |
| POST | /:id/incidents | daily_logs.create | Add incident entry |
| DELETE | /:id/incidents/:incidentId | daily_logs.edit | Remove incident entry |
| GET | /:id | daily_logs.view | Get daily log by ID |
| PATCH | /:id | daily_logs.edit | Update daily log |
| DELETE | /:id | daily_logs.delete | Delete daily log |

### Meetings - `meetings.controller.ts`
Base: `/projects/:projectId/meetings`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | / | meetings.view | List meetings |
| POST | / | meetings.create | Create meeting |
| POST | /:id/agenda | meetings.create | Add agenda item |
| PATCH | /:id/agenda/:agendaItemId | meetings.edit | Update agenda item |
| DELETE | /:id/agenda/:agendaItemId | meetings.edit | Remove agenda item |
| POST | /:id/attendees | meetings.create | Add attendee |
| PATCH | /:id/attendees/:attendeeId | meetings.edit | Update attendee |
| DELETE | /:id/attendees/:attendeeId | meetings.edit | Remove attendee |
| POST | /:id/action-items | meetings.create | Add action item |
| PATCH | /:id/action-items/:actionItemId | meetings.edit | Update action item |
| DELETE | /:id/action-items/:actionItemId | meetings.edit | Remove action item |
| GET | /:id | meetings.view | Get meeting by ID |
| PATCH | /:id | meetings.edit | Update meeting |
| DELETE | /:id | meetings.delete | Delete meeting |

### Correspondence - `correspondence.controller.ts`
Base: `/projects/:projectId/correspondence`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | / | correspondence.view | List correspondence |
| POST | / | correspondence.create | Create correspondence |
| GET | /:id | correspondence.view | Get correspondence by ID |
| PATCH | /:id | correspondence.edit | Update correspondence |
| DELETE | /:id | correspondence.delete | Delete correspondence |

### Risks - `risks.controller.ts`
Base: `/projects/:projectId/risks`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | / | risks.view | List risks |
| POST | / | risks.create | Create risk |
| GET | /:id | risks.view | Get risk by ID |
| PATCH | /:id | risks.edit | Update risk |
| DELETE | /:id | risks.delete | Delete risk |

### Issues - `issues.controller.ts`
Base: `/projects/:projectId/issues`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | / | issues.view | List issues |
| GET | /:issueId | issues.view | Get issue by ID |
| POST | / | issues.create | Create issue |
| PATCH | /:issueId | issues.edit | Update issue |
| DELETE | /:issueId | issues.delete | Delete issue |

### Punch Items - `punch-items.controller.ts`
Base: `/projects/:projectId/punch-items`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | / | punch_items.view | List punch items |
| POST | / | punch_items.create | Create punch item |
| GET | /:id | punch_items.view | Get punch item by ID |
| PATCH | /:id | punch_items.edit | Update punch item |
| DELETE | /:id | punch_items.delete | Delete punch item |

### Closeout - `closeout.controller.ts`
Base: `/projects/:projectId/closeout`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | / | closeout.view | Get project closeout |
| POST | / | closeout.create | Initialize closeout |
| PATCH | / | closeout.edit | Update closeout |
| PATCH | /checklist/:itemId | closeout.edit | Toggle checklist item |
| POST | /warranties | closeout.create | Add warranty record |
| PATCH | /warranties/:warrantyId | closeout.edit | Update warranty record |
| DELETE | /warranties/:warrantyId | closeout.delete | Remove warranty record |

### Engineering Documents - `engineering-documents.controller.ts`
Base: `/projects/:projectId/task-disciplines/:taskDisciplineId/engineering-documents`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | / | schedule.view | List engineering documents |
| GET | /upload-folder | schedule.view | Resolve discipline upload folder |
| POST | /register | schedule.edit | Register uploaded file as EDV Rev 0 |
| GET | /:id | schedule.view | Get engineering document |
| PATCH | /:id | schedule.edit | Update document metadata |
| DELETE | /:id | schedule.delete | Soft-delete engineering document |
| POST | /:id/versions | schedule.create | Upload new EDV revision |
| PATCH | /:id/versions/:versionId | schedule.edit | Update EDV revision label |
| POST | /:id/versions/:versionId/transition | schedule.approve | Transition EDV status via WorkflowKernel |
| GET | /:id/versions/:versionId/events | schedule.view | List workflow events for EDV |

### Design Packages - `design-packages.controller.ts`
Base: `/projects/:projectId/task-disciplines/:taskDisciplineId/design-packages`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | / | schedule.view | List design packages |
| POST | / | schedule.create | Create design package |
| GET | /:packageId | schedule.view | Get design package |
| PATCH | /:packageId | schedule.edit | Update design package |
| DELETE | /:packageId | schedule.delete | Soft-delete design package |
| POST | /:packageId/items | schedule.edit | Add EDV to design package |
| DELETE | /:packageId/items/:itemId | schedule.edit | Remove item from design package |
| GET | /:packageId/dependencies | schedule.view | List package dependencies |
| POST | /:packageId/dependencies | schedule.edit | Create package dependency |
| DELETE | /:packageId/dependencies/:dependencyId | schedule.edit | Delete package dependency |
| POST | /:packageId/lock-edvs | schedule.view | Lock all EDVs in package |
| POST | /:packageId/batch-approve | schedule.approve | Batch approve EDVs in package |
| POST | /:packageId/batch-return | schedule.approve | Batch return EDVs with comments |
| POST | /:packageId/submit-for-review | schedule.create | Submit package - opens session + snapshot |
| POST | /:packageId/review-sessions/:reviewSessionId/approve | schedule.approve | Approve review session at current tier |
| POST | /:packageId/return-for-rework | schedule.approve | Return package for rework |

### Review Comments - `review-comments.controller.ts`
Base: `/review-comments`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | /:commentId | schedule.view | Get review comment detail |
| POST | / | schedule.approve | Add review comment |
| PATCH | /:commentId | schedule.view | Edit own OPEN comment |
| PATCH | /:commentId/status | schedule.view | Transition comment status |
| POST | /:commentId/verify | schedule.approve | Verify RESOLVED comment |
| DELETE | /:commentId | schedule.view | Remove own OPEN comment |

### Review Batch - `review-batch.controller.ts`
Base: `/review`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| POST | /batch-approve | schedule.approve | Batch approve EDVs in a design package |
| POST | /batch-return | schedule.approve | Batch return EDVs with comment template |

### Engineering Batch - `engineering-batch.controller.ts`
Base: `/projects/:projectId`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| POST | /engineering-documents/batch-lock | schedule.approve | Lock all EDVs across multiple packages |
| GET | /engineering-documents/:id/decision-trace | schedule.view | Decision trace lineage for a document |
| POST | /engineering-documents/:id/trigger-revision | schedule.edit | Trigger external revision - new DRAFT from LOCKED |
| POST | /revision-triggers/:triggerId/process | schedule.edit | Process PENDING external review trigger |

### EPC Workspace - `epc-workspace.controller.ts`
Base: root (no prefix)
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| GET | /review-inbox | schedule.approve | Review inbox for current user |
| GET | /my-comments | schedule.view | Open comments assigned to current user |
| GET | /projects/:projectId/review-inbox | schedule.approve | Review inbox scoped to a project |
| GET | /projects/:projectId/my-comments | schedule.view | Open comments scoped to a project |
| GET | /projects/:projectId/status-board | schedule.view | Project EPC status board KPIs |
| GET | /projects/:projectId/workload | schedule.view | Dispatcher workload and bottleneck KPIs |
| GET | /design-packages/:designPackageId/review-mode | schedule.view | Review mode payload for a package |
| GET | /engineering-documents/:engineeringDocumentId/version-history | schedule.view | EDV version history with workflow events |

### Workflow Events - `workflow-events.controller.ts`
Base: `/workflow-events`
| Method | Route | Permission required | Description |
|--------|-------|-------------------|-------------|
| POST | /:eventId/correct | schedule.approve | Append CORRECTION event to a prior workflow log row |
