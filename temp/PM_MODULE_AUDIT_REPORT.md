# PM Module Comprehensive Audit Report

**Repository:** `c:\Users\PAVILION\Documents\ERP System`
**Audit Date:** 2026-06-25
**Auditor:** Claude Code (read-only, no code changes)

---

## MODULE 1 - Projects

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `Project` model is well-formed with all standard fields, companyId, and soft-delete | - | schema.prisma:1253 |
| `ProjectTeam` has no `@@unique([projectId, userId])` database constraint - duplicate memberships are possible | High | schema.prisma:1312-1331 |
| `ProjectTeam` has no `role` column in schema, yet `seed-pm-demo.ts` seeds with `ProjectTeamRole` enum values | Critical | schema.prisma:1312-1331, seed-pm-demo.ts |
| `Task` has no `companyId` field - it cannot be directly tenant-scoped without joining through the project | High | schema.prisma:1355-1406 |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `listTeam` uses `activeOnly({ projectId })` with no `companyId` check - a user from a different tenant knowing a projectId can enumerate team members | High | projects.service.ts:310 |
| `updateProject` writes `dto.status` directly with no transition guard - any status jump (e.g. ACTIVE→PLANNING) is accepted | Medium | projects.service.ts:181-230 |
| No `AuditLog` writes anywhere in `ProjectsService` | Medium | projects.service.ts entire file |
| `getDashboardStats` counts RFIs/Issues/PunchItems via `activeOnly({ projectId })` - no companyId guard, but those entities have no companyId field anyway | High | projects.service.ts, schema.prisma |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| All 7 endpoints properly decorated with `@RequirePermission` and `@UseGuards(PermissionsGuard)` | - | projects.controller.ts |
| `POST /projects` has no `@HttpCode(201)` - returns 200 on creation | Low | projects.controller.ts:55 |
| Route param inconsistency: nested routes use `:projectId`, top-level uses `:id` | Low | projects.controller.ts |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| `ProjectStatus` enum has 7 values (PLANNING, TENDER, MOBILIZATION, ACTIVE, ON_HOLD, COMPLETED, CLOSED); none enforced by transition guard | Medium | schema.prisma, projects.service.ts:181 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `ProjectStatus` type aligns with backend enum | - | project-management.types.ts:14 |
| `useProjects`, `useProject`, `useCreateProject`, `useUpdateProject`, `useDeleteProject`, `useSetProjectTeam` all present | - | query/projects.ts |
| `useAllProjects` fetches paginated list sequentially to avoid throttling - documented intent | - | query/projects.ts:87 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| `'projects'` module seeded in PM_MODULES with standard flags | - | seed.ts:253 |
| `ChangeRequestsController` uses `'projects'` permission module for all CR endpoints - change requests have no dedicated module | High | change-requests.controller.ts:39,54,69,84,101,116,133 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| No status machine enforced - a PM can jump project directly from PLANNING to CLOSED without intermediate states | Medium | projects.service.ts:181 |
| `ProjectTeam` has no `@@unique` - same user can be added twice, inflating team counts | High | schema.prisma:1312 |

---

## MODULE 2 - Schedule (Milestones, Tasks, Dependencies, Disciplines)

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `Milestone.status` is plain `String` default "PLANNED" - not an enum | High | schema.prisma:1339 |
| `Task` has no `companyId` field | High | schema.prisma:1355 |
| `TaskDiscipline` stores both denormalized string names (`designerName`, `reviewerName`) AND FK user IDs - dual storage pattern | Medium | schema.prisma:1408-1460 |
| `TaskDependency` has no `companyId` or soft-delete fields | Medium | schema.prisma |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `listMilestones` and `getMilestoneOrThrow` use `activeOnly({ projectId })` - no companyId check | High | schedule.service.ts:82, 690 |
| `createTaskDependency` has no cycle detection - circular dependency A→B→A is storable | High | schedule.service.ts:376-403 |
| `deleteTaskDependency` uses hard delete (`prisma.taskDependency.delete`) - inconsistent with soft-delete convention | Medium | schedule.service.ts:476 |
| `COMPLETED` status is non-terminal: `COMPLETED→[IN_PROGRESS]` is an allowed transition | Medium | schedule.service.ts:286-293 |
| `DELAYED→[IN_PROGRESS, NOT_STARTED]` - cannot transition directly from DELAYED to COMPLETED | Low | schedule.service.ts:290 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| No `GET /tasks/:id` endpoint - individual task fetch is missing | High | schedule.controller.ts |
| No `GET /milestones/:id` endpoint - individual milestone fetch is missing | High | schedule.controller.ts |
| All existing endpoints properly decorated with `@RequirePermission('schedule', ...)` | - | schedule.controller.ts |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| `Task` status transitions are enforced in service | - | schedule.service.ts:286-293 |
| `Milestone.status` written without transition guard | Medium | schedule.service.ts |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `TASK_VALID_TRANSITIONS` in frontend shows `DELAYED→['IN_PROGRESS', 'COMPLETED']` but backend allows `DELAYED→['IN_PROGRESS', 'NOT_STARTED']` - **mismatch**: frontend permits DELAYED→COMPLETED, backend forbids it | High | pm-status-transitions.ts:9, schedule.service.ts:290 |
| `TaskStatus` and `MilestoneStatus` types defined in frontend types | - | project-management.types.ts:33, 212 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| `DeliverablesController` uses `'schedule'` permission module for all CRUD endpoints - deliverables have no dedicated permission module | High | deliverables.controller.ts:36,52,66,82,99 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| Missing cycle detection allows nonsensical dependencies (A depends on A, A→B→A) | High | schedule.service.ts:376 |
| Hard delete on task dependencies loses audit trail of dependency changes | Low | schedule.service.ts:476 |

---

## MODULE 3 - RFIs

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `Rfi` has no `companyId` field - cannot be directly tenant-scoped without joining through project | High | schema.prisma |
| `RfiStatus` enum is well-defined with 5 values: DRAFT, SUBMITTED, UNDER_REVIEW, ANSWERED, CLOSED | - | schema.prisma |
| `RfiResponse` model lacks soft-delete fields | Low | schema.prisma |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `getRfiOrThrow` uses `activeOnly({ id: rfiId, projectId })` - no companyId check (no field to check against) | High | rfis.service.ts:427-434 |
| `assertCanRespondToRfi` correctly enforces only the assignee can respond | - | rfis.service.ts:406-425 |
| `addRfiResponse` auto-sets status to ANSWERED and `dateAnswered` in a transaction | - | rfis.service.ts:268-292 |
| `createRfi` validates `assignedTo` user is in company; validates `taskDisciplineId` discipline access | - | rfis.service.ts:111-126 |
| Status transition guard enforced in `updateRfi` | - | rfis.service.ts:180-200 |
| `enrichRfi` calls `ensureRfiFolder` on every single RFI fetch - N+1 DB calls on list endpoint (one folder query per RFI) | High | rfis.service.ts:341-367, 77-85 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| `POST :rfiId/responses` uses `@RequirePermission('rfis', 'view')` - should require 'create' or 'edit', not just view | High | rfis.controller.ts:109 |
| All other endpoints correctly use matching permission actions | - | rfis.controller.ts |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| Full transition graph enforced: DRAFT→SUBMITTED→UNDER_REVIEW→ANSWERED→CLOSED; CLOSED is terminal | - | rfis.service.ts:185-191 |
| Frontend `RFI_VALID_TRANSITIONS` matches backend exactly | - | pm-status-transitions.ts:14-20 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `useRfis`, `useRfi`, `useRfiResponses`, `useCreateRfi`, `useUpdateRfi`, `useDeleteRfi`, `useAddRfiResponse` all present | - | query/rfis.ts |
| Response creation invalidates list and detail caches | - | query/rfis.ts:153-181 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| `'rfis'` module seeded in PM_MODULES | - | seed.ts:253 |
| `POST /responses` permission weakness: `'rfis', 'view'` grants response creation to anyone with view access | High | rfis.controller.ts:109 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| N+1 folder query on list degrades performance for projects with many RFIs | High | rfis.service.ts:77-85 |
| `assertRfiVisible` checks discipline scope correctly - RFIs not in user's discipline are hidden | - | rfis.service.ts:369-401 |

---

## MODULE 4 - Submittals

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `SubmittalItemType` enum has only one value: `DESIGN_PACKAGE` | Low | schema.prisma:1004-1006 |
| `Submittal` has no `companyId` field - no direct tenant scoping | High | schema.prisma |
| `SubmittalStatus` enum has 7 values (DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, APPROVED_WITH_COMMENTS, REVISE_AND_RESUBMIT, REJECTED) | - | schema.prisma |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `SUBMITTAL_STATUS_TRANSITIONS` only covers DRAFT→[SUBMITTED], SUBMITTED→[DRAFT], UNDER_REVIEW→[] - APPROVED, REVISE_AND_RESUBMIT, REJECTED, APPROVED_WITH_COMMENTS have no general update transitions | High | submittals.service.ts:58-62 |
| `submitToDisciplineLead` handles resubmission case with `revisionNumber` increment | - | submittals.service.ts:365-393 |
| `assertCanReviewSubmittal` checks assignee or discipline lead can review | - | submittals.service.ts:783-811 |
| `getSubmittalOrThrow` uses `activeOnly({ id, projectId })` - no companyId | High | submittals.service.ts:729 |
| `addReview` records `ExternalReviewTrigger` via `externalReviewTrigger.recordFromSubmittalReview` | - | submittals.service.ts:685-694 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| `POST :id/reviews` uses `@RequirePermission('submittals', 'view')` - same weakness as RFIs | High | submittals.controller.ts:172 |
| `POST :id/submit-to-lead` uses `@RequirePermission('submittals', 'create')` - correct intent | - | submittals.controller.ts:98 |
| All other endpoints properly decorated | - | submittals.controller.ts |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| UNDER_REVIEW→[] in transition map means no direct PATCH can move a UNDER_REVIEW submittal to any status - reviewer must use dedicated `/reviews` endpoint | Medium | submittals.service.ts:58-62 |
| Frontend `SUBMITTAL_DIRECT_TRANSITIONS` matches backend map | - | pm-status-transitions.ts:30-41 |
| Frontend `SubmittalStatus` type includes all 7 status values | - | project-management.types.ts:58-66 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `useSubmittals`, `useSubmittal`, `useSubmittalReviews`, `useCreateSubmittal`, `useCreateConstructionSubmittal`, `useSubmitSubmittalToLead`, `useUpdateSubmittal`, `useDeleteSubmittal`, `useAddSubmittalReview` present | - | query/submittals.ts |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| `'submittals'` module seeded in PM_MODULES | - | seed.ts:253 |
| `POST /reviews` permission weakness same as RFIs | High | submittals.controller.ts:172 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| APPROVED, APPROVED_WITH_COMMENTS, REVISE_AND_RESUBMIT have no outgoing transitions - once in review verdict, submittal is frozen (no reopen path via direct PATCH) | Medium | submittals.service.ts:58-62 |

---

## MODULE 5 - Daily Logs

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `DailyLog.status` is plain `String` default "DRAFT" - not an enum | High | schema.prisma:2037 |
| `DailyLog` has no `companyId` field | High | schema.prisma |
| Child entities (workforce, equipment, visitors, incidents) have no soft-delete fields | Medium | schema.prisma |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `updateDailyLog` correctly blocks data field changes when status is SUBMITTED or APPROVED | - | daily-logs.service.ts:192-199 |
| No status transition guard - `dto.status` written directly, any value accepted | High | daily-logs.service.ts:209 |
| Child entities (workforce, equipment, visitors, incidents) use hard delete via `deleteChildOrThrow` | Medium | daily-logs.service.ts:488 |
| `getDailyLogDetailOrThrow` uses `activeOnly({ id, projectId })` - no companyId | High | daily-logs.service.ts:462 |
| `createDailyLog` catches P2002 (duplicate date/shift) gracefully | - | daily-logs.service.ts:168-176 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| All endpoints decorated with `@RequirePermission('daily_logs', ...)` | - | daily-logs.controller.ts |
| Child entity delete uses `@RequirePermission('daily_logs', 'edit')` - correct | - | daily-logs.controller.ts:80 |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| Status values DRAFT/SUBMITTED/APPROVED are referenced in service logic but `DailyLog.status` is a plain string - no DB-level enforcement | High | schema.prisma:2037, daily-logs.service.ts:192 |
| No transition guard - can jump from DRAFT directly to APPROVED | High | daily-logs.service.ts:209 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `DailyLog.status` typed as `string` in frontend types - reflects schema reality | - | project-management.types.ts:419 |
| All child entity CRUD hooks present in query/daily-logs.ts | - | query/daily-logs.ts |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| `'daily_logs'` module seeded in PM_MODULES | - | seed.ts:253 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| Hard delete on child entries loses audit trail of workforce/equipment records for the day | Medium | daily-logs.service.ts:488 |
| No status transition guard means a CLOSED log can be reopened to DRAFT | High | daily-logs.service.ts:209 |

---

## MODULE 6 - Meetings

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `Meeting` has no `companyId` field | High | schema.prisma |
| `MeetingAgendaItem` and `MeetingAttendee` have no soft-delete fields | Medium | schema.prisma |
| `ActionItem.status` is plain `String` - not an enum | Medium | schema.prisma:2192 |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `updateMeeting` auto-sets `minutesIssuedAt` when status becomes MINUTES_ISSUED | - | meetings.service.ts:172-173 |
| No status transition guard for `Meeting.status` - `dto.status` written directly | High | meetings.service.ts:167 |
| `getMeetingDetailOrThrow` uses `activeOnly({ id, projectId })` - no companyId | High | meetings.service.ts:481 |
| Agenda items and attendees use hard delete | Medium | meetings.service.ts |
| `MEETING_DETAIL_INCLUDE` filters action items by `deletedAt: null` - action items properly soft-deleted | - | meetings.service.ts:53 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| All endpoints decorated with matching permission actions | - | meetings.controller.ts |
| Agenda item delete uses `@RequirePermission('meetings', 'edit')` - correct | - | meetings.controller.ts:100 |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| Meeting lifecycle: SCHEDULED→CONDUCTED→MINUTES_ISSUED→CLOSED; only `minutesIssuedAt` auto-set on transition | Medium | meetings.service.ts:167-173 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `MeetingDetail` type includes agendaItems, attendees, actionItems | - | project-management.types.ts:510 |
| Optimistic cache update for sub-entities (agenda, attendees, action items) via `patchMeetingDetail` | - | query/meetings.ts:421-430 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| `'meetings'` module seeded in PM_MODULES | - | seed.ts:253 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| Hard delete on agenda items and attendees loses history of meeting participants | Medium | meetings.service.ts |
| No status guard means meeting can jump from SCHEDULED to CLOSED without issuing minutes | Medium | meetings.service.ts:167 |

---

## MODULE 7 - Correspondence

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `Correspondence` has no `companyId` field | High | schema.prisma |
| `CorrespondenceStatus` enum well-defined: DRAFT, SENT, ACKNOWLEDGED, CLOSED | - | schema.prisma |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| No status transition guard - `dto.status` written directly | High | correspondence.service.ts:147 |
| Auto-generates `referenceNumber` if not provided using sequence-based approach | - | correspondence.service.ts:98-100 |
| `getCorrespondenceOrThrow` uses `activeOnly({ id, projectId })` - no companyId | High | correspondence.service.ts:226 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| All 5 endpoints decorated with `@RequirePermission('correspondence', ...)` | - | correspondence.controller.ts |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| No transition guard enforced - status can jump from DRAFT to CLOSED | High | correspondence.service.ts:147 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `CorrespondenceStatus` and `CorrespondenceType` types defined | - | project-management.types.ts:109-123 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| `'correspondence'` module seeded in PM_MODULES | - | seed.ts:253 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| No transition guard allows SENT correspondence to be set back to DRAFT | Medium | correspondence.service.ts:147 |

---

## MODULE 8 - Risks

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `Risk` has no `companyId` field | High | schema.prisma |
| `RiskStatus` enum well-defined: OPEN, MONITORING, MITIGATED, CLOSED | - | schema.prisma |
| No auto-number sequence for risks - `riskIdCode` is user-provided | Medium | seed.ts (no RISK sequence) |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `riskScore` auto-computed as `probability * impact` - correct | - | risks.service.ts:109, 149 |
| No status transition guard - `dto.status` written directly | High | risks.service.ts:143 |
| `getRiskOrThrow` uses `activeOnly({ id, projectId })` - no companyId | High | risks.service.ts:224 |
| No sequence-based risk number - user must supply `riskIdCode` | Medium | risks.service.ts:103 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| All 5 endpoints decorated with `@RequirePermission('risks', ...)` | - | risks.controller.ts |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| No transition guard - can jump from OPEN to CLOSED | High | risks.service.ts:143 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `Risk` type and all CRUD requests defined | - | project-management.types.ts:533-551 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| `'risks'` module seeded in PM_MODULES | - | seed.ts:253 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| No auto-number means IDs are free-text and could be duplicated | Medium | risks.service.ts:103 |

---

## MODULE 9 - Issues

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `Issue` has no `companyId` field | High | schema.prisma |
| `IssueStatus` enum well-defined: OPEN, ASSIGNED, IN_PROGRESS, RESOLVED, VERIFIED, CLOSED | - | schema.prisma |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| No status transition guard - `dto.status` written directly | High | issues.service.ts:166 |
| `getIssueOrThrow` uses `activeOnly({ id, projectId })` - no companyId | High | issues.service.ts:287 |
| `assertIssueVisible` checks discipline scope for issues linked to a discipline | - | issues.service.ts:262-285 |
| Issue number generated from `ISSUE` sequence | - | document-number.service.ts, seed.ts:1139 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| All 5 endpoints decorated with `@RequirePermission('issues', ...)` | - | issues.controller.ts |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| No transition guard - can jump from OPEN to CLOSED skipping RESOLVED/VERIFIED | High | issues.service.ts:166 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `Issue` type with `IssueStatus` and `IssueSeverity` types defined | - | project-management.types.ts:553-571 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| `'issues'` module seeded in PM_MODULES | - | seed.ts:253 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| Anyone on the project can verify an issue they raised - no self-verification guard | Medium | issues.service.ts |

---

## MODULE 10 - Punch List

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `PunchItem` has no `companyId` field | High | schema.prisma |
| `PunchItemStatus` enum well-defined: RAISED, ASSIGNED, CORRECTED, VERIFIED, CLOSED | - | schema.prisma |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| No status transition guard - `dto.status` written directly | High | punch-items.service.ts:143 |
| Auto-sets `correctedAt` when status becomes CORRECTED; `verifiedAt` when VERIFIED | - | punch-items.service.ts:153-155 |
| `getPunchItemOrThrow` uses `activeOnly({ id, projectId })` - no companyId | High | punch-items.service.ts:228 |
| No self-certification guard: the user who raised a punch item can verify it themselves | High | punch-items.service.ts |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| All 5 endpoints decorated with `@RequirePermission('punch_items', ...)` | - | punch-items.controller.ts |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| No transition guard - can jump from RAISED to VERIFIED | High | punch-items.service.ts:143 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `PunchItem` type with `PunchItemStatus` and `PunchItemSeverity` defined | - | project-management.types.ts:573-590 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| `'punch_items'` module seeded in PM_MODULES | - | seed.ts:253 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| No self-certification guard is a construction quality control issue - contractor can raise and verify their own punch items | High | punch-items.service.ts |

---

## MODULE 11 - Closeout

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `Closeout` model has NO `deletedAt`/`deletedBy` fields - cannot be soft-deleted | High | schema.prisma:2327-2350 |
| `CloseoutChecklistItem` has NO `deletedAt`/`deletedBy` fields - cannot be soft-deleted | High | schema.prisma:2351-2369 |
| `CloseoutStatus` is a well-defined enum in the schema | - | schema.prisma |
| `Warranty` model correctly has `deletedAt`/`deletedBy` fields | - | schema.prisma |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `getCloseoutRecordOrThrow` uses plain `prisma.closeout.findFirst({ where: { projectId } })` - no soft-delete filter, no companyId | High | closeout.service.ts:291-298 |
| `updateCloseout` writes `dto.status` directly - no transition guard | High | closeout.service.ts:171 |
| `updateChecklistItem` allows any user on project to verify items; `assertUserInCompany` only checks company membership | Medium | closeout.service.ts:202-208 |
| Default checklist items created in transaction on `createCloseout` | - | closeout.service.ts:130-140 |
| `getCloseout` calls `getProjectOrThrow` for auth but `getCloseoutRecordOrThrow` bypasses scope | High | closeout.service.ts:90, 291 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| `PATCH /` (update closeout) and `PATCH /checklist/:itemId` share the same prefix - routing relies on NestJS ordering | Low | closeout.controller.ts:55-81 |
| All 7 endpoints decorated with `@RequirePermission('closeout', ...)` | - | closeout.controller.ts |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| `CloseoutStatus` has 5 values; no transition guard enforced | High | closeout.service.ts:171 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `CloseoutDetail`, `CloseoutChecklistItem`, `Warranty` types defined | - | project-management.types.ts:592-629 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| `'closeout'` module seeded in PM_MODULES | - | seed.ts:253 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| Checklist items cannot be deleted (no soft-delete) - only toggled complete/incomplete | Medium | schema.prisma:2351-2369 |
| `Closeout` record cannot be soft-deleted if a project is re-scoped | Medium | schema.prisma:2327-2350 |

---

## MODULE 12 - Change Requests

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `ProjectChangeRequest` references `externalReviewTriggerId` but no FK relation is explicitly defined - referenced through string ID | High | schema.prisma:1938-1965 |
| `ChangeRequestStatus` enum: DRAFT, SUBMITTED, APPROVED, REJECTED, CLOSED | - | schema.prisma |
| No dedicated sequence for change request numbers | High | seed.ts (no CR sequence) |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `approveChangeRequest` can approve from ANY status, not just SUBMITTED | Critical | project-change-request.service.ts:155-179 |
| `rejectChangeRequest` appends rejection reason to `description` field - no dedicated rejection reason field | Medium | project-change-request.service.ts:198-209 |
| `generateChangeNumber` uses COUNT-based approach: `CR-${(count + 1).padStart(5, '0')}` - race condition risk under concurrent inserts | High | project-change-request.service.ts:328-332 |
| `createFromExternalTrigger` uses `CR-${triggerId.slice(0, 8).toUpperCase()}` - truncated UUID, uniqueness depends on UUID entropy | High | project-change-request.service.ts:259 |
| `getChangeRequestOrThrow` uses `activeOnly({ id, companyId, projectId })` - properly scoped | - | project-change-request.service.ts:315 |
| No status transition guard in `updateChangeRequest` | High | project-change-request.service.ts:141 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| All endpoints use `@RequirePermission('projects', ...)` - change requests share the `projects` module with no dedicated permission | High | change-requests.controller.ts:39,54,69,84,101,116,133 |
| `PATCH /:changeRequestId/approve` uses `@RequirePermission('projects', 'edit')` - no explicit approver role check | High | change-requests.controller.ts:101 |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| `approveChangeRequest` works from any status - a CLOSED or REJECTED CR can be approved | Critical | project-change-request.service.ts:155 |
| No reject→resubmit path defined | Medium | project-change-request.service.ts |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `ProjectChangeRequest` type and all DTOs defined | - | project-management.types.ts:1044-1076 |
| `changeRequestCount` badge shown in sidebar using `pm.projects.canView` | - | ProjectWorkspaceSidebar.tsx:81-83 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| No dedicated `change_requests` permission module seeded | High | seed.ts |
| Any user with `projects.edit` can approve a change request | High | change-requests.controller.ts:101 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| Count-based CR number generation under concurrent inserts can produce duplicate numbers | High | project-change-request.service.ts:328 |
| `approveChangeRequest` from any status bypasses the intended DRAFT→SUBMITTED→APPROVED governance | Critical | project-change-request.service.ts:155 |

---

## MODULE 13 - Deliverables

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `DeliverableStatus` enum well-defined: PLANNED, IN_PROGRESS, SUBMITTED, APPROVED, WAIVED | - | schema.prisma |
| No dedicated sequence for deliverable numbers | Medium | seed.ts (no DELIVERABLE sequence) |
| `Deliverable` has `companyId` field | - | schema.prisma |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `buildListWhere` includes `companyId: ctx.companyId` - properly scoped | - | deliverable.service.ts:215 |
| `getDeliverableOrThrow` uses `activeOnly({ id, companyId, projectId })` - properly scoped | - | deliverable.service.ts:263 |
| `createDeliverable` hardcodes initial status as `DeliverableStatus.PLANNED` | - | deliverable.service.ts:131 |
| No status transition guard in `updateDeliverable` - `dto.status` written directly | High | deliverable.service.ts:175 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| All endpoints use `@RequirePermission('schedule', ...)` - deliverables have no dedicated permission module | High | deliverables.controller.ts:36,52,66,82,99 |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| No transition guard - can jump from PLANNED to APPROVED | High | deliverable.service.ts:175 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `Deliverable` type and DTOs defined | - | project-management.types.ts:1085-1116 |
| `deliverableCount` badge shown in sidebar using `pm.schedule.canView` | - | ProjectWorkspaceSidebar.tsx:85-88 |
| `PmModuleKey` type does NOT include `'deliverables'` | High | project-management.types.ts:677-689 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| No dedicated `deliverables` permission module seeded | High | seed.ts |
| `DeliverableService` is NOT exported from `ProjectManagementModule` | High | project-management.module.ts |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| `DeliverableService` not exported makes it unavailable for injection in other modules | High | project-management.module.ts |

---

## MODULE 14 - EPC Engineering Documents

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `EngineeringDocument.documentNumber` is optional (`String?`) - document numbers not required | High | schema.prisma:1463 |
| `EngineeringDocumentVersion` (EDV) has `status` field using `EdvStatus` enum: DRAFT, IN_REVIEW, APPROVED, LOCKED, SUPERSEDED | - | schema.prisma |
| `Drawing.status` and `DrawingVersion.status` are plain `String` - not enums | Medium | schema.prisma:1975, 2001 |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| EDV status transitions enforced via `edv-state-machine.ts` | - | edv-state-machine.ts:18-34 |
| LOCKED and SUPERSEDED are terminal states - properly enforced | - | edv-state-machine.ts:36-39 |
| `validateNewRevisionUpload` blocks new revision if active DRAFT exists | - | edv-state-machine.ts:121-143 |
| `edvStatusAllowsComments` allows comments on APPROVED status (IN_REVIEW or APPROVED) | - | edv-state-machine.ts:149-151 |
| `EngineeringDocumentFolderService.ensureRfiFolder` called on every RFI list item - N+1 pattern | High | rfis.service.ts:341-367 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| No dedicated `engineering_documents` permission module seeded - EPC actions use `schedule` module proxy | High | seed.ts, permission-resolver.service.ts:150-155 |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| Full state machine: DRAFT→IN_REVIEW→APPROVED→LOCKED; SUPERSEDED from any pre-terminal state | - | edv-state-machine.ts:18-34 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `PmModuleKey` does NOT include `'engineering_documents'` or `'design_packages'` | High | project-management.types.ts:677-689 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| No `engineering_documents` or `design_packages` permissions seeded in PM_MODULES | High | seed.ts:253-266 |
| `PermissionResolverService.resolveGrantedActions` maps `schedule.canView` to ALL review governance actions - anyone with schedule view access can attempt to approve/return review sessions | High | permission-resolver.service.ts:179-183 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| Optional `documentNumber` means engineering documents can be created without a number - not suitable for formal document control | High | schema.prisma:1463 |
| `schedule.canView` granting full review governance actions is overly permissive | High | permission-resolver.service.ts:179-183 |

---

## MODULE 15 - EPC Design Packages

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `DesignPackage` model exists with required FK to `taskDiscipline` | - | schema.prisma |
| `DesignPackage` has projected status field managed by phase-B computation | - | schema.prisma |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `batchIssue` and `batchAddItems` operations in `SubmittalsService` handle multiple design packages in one call | - | submittals.service.ts |
| `conflictGuard.assertNoActiveSessionOnPackage` prevents duplicate review sessions | - | review-workflow.service.ts:123 |
| `conflictGuard.assertSubmitDependenciesSatisfied` checks package prerequisites | - | review-workflow.service.ts:128 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| No dedicated `design_packages` permission module seeded | High | seed.ts |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| Package status is projected (Phase B), not directly writable - computed from constituent EDV statuses | - | state-projection service |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `PmModuleKey` does NOT include `'design_packages'` | High | project-management.types.ts:677 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| No `design_packages` permissions seeded | High | seed.ts |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| Package status computation depends on Phase-B projection being current - stale projection gives stale package status | Medium | state-projection service |

---

## MODULE 16 - EPC Review Sessions

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `ReviewSession` model has `currentTier`, `assignedToUserId`, `slaDeadlineAt`, `slaEscalatedAt` fields | - | schema.prisma |
| `ReviewSessionStatus` enum: ACTIVE, APPROVED, RETURNED_FOR_REWORK, CLOSED, SUPERSEDED | - | schema.prisma |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `approveReviewSession` advances tier chain correctly; final tier closes session | - | review-workflow.service.ts:657-862 |
| `assertActorMatchesReviewTier` enforces actor must hold the correct role for the current tier | - | review-workflow.service.ts:1346-1368 |
| `revertPrematureEdvApprovalsInTx` reverts batch-approved EDVs when tier escalates | - | review-workflow.service.ts:1100-1144 |
| `repairOrphanedInReviewEdvs` auto-repairs IN_REVIEW state with no active session | - | review-workflow.service.ts:1149-1193 |
| `advanceActiveSessionTierInTx` throws if next tier has no assignee - blocks progression | Medium | review-workflow.service.ts:1278 |
| SLA overdue is visibility-only - never blocks workflow | - | review-sla.service.ts |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| No dedicated `review_sessions` permission module seeded | High | seed.ts |
| Admin reassignment of session requires `System Administrator` or `Managing Director` role | - | workflow-kernel.service.ts:73-76 |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| Full tier chain: DISCIPLINE_OWNER→REVIEWER→DISCIPLINE_LEAD→DEPT_CHIEF | - | review-workflow.service.ts |
| `canCloseReviewSession` / `canApprovePackage` both require all comments VERIFIED or CLOSED | - | comment-state-machine.ts:140-151 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `ReviewSessionSummary` type defined with all fields | - | project-management.types.ts:1149-1160 |
| `PmModuleKey` does NOT include `'review_sessions'` | High | project-management.types.ts:677 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| No dedicated `review_sessions` permissions seeded | High | seed.ts |
| `schedule.canView` grants `REVIEW_SESSION_APPROVE` to all users with schedule read access - discipline assignment layer is the actual gate | High | permission-resolver.service.ts:179-183 |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| Tier escalation blocks if next-tier role unassigned - must pre-populate all reviewer roles before submitting | Medium | review-workflow.service.ts:1278 |
| SLA overdue notification references `session.updatedBy` as sender context, not a proper PMO user | Low | review-sla.service.ts:189 |

---

## MODULE 17 - EPC Review Comments

### A. Schema Completeness

| Finding | Severity | Location |
|---|---|---|
| `ReviewComment` model has severity, status, assignedToUser, body, commentDocumentVersionId | - | schema.prisma |
| `CommentStatus` enum: OPEN, ACKNOWLEDGED, IN_PROGRESS, RESOLVED, VERIFIED, CLOSED | - | schema.prisma |

### B. Service Layer Correctness

| Finding | Severity | Location |
|---|---|---|
| `ACTOR_ALLOWED_TARGETS.reviewer` set contains duplicate `CommentStatus.IN_PROGRESS` entry | Low | comment-state-machine.ts:42 (harmless in Set) |
| `canTransitionCommentStatus` enforces both state machine transitions AND actor role constraints | - | comment-state-machine.ts:69-125 |
| `removeReviewComment` only allows author to remove their own OPEN comments | - | review-workflow.service.ts:500-551 |
| `updateReviewComment` only allows author to edit OPEN comments | - | review-workflow.service.ts:556-652 |
| `addReviewComment` calculates routing (severity-based tier escalation) but does not persist escalation to comment record | Medium | review-workflow.service.ts:337-342 |

### C. Controller Correctness

| Finding | Severity | Location |
|---|---|---|
| No dedicated `review_comments` permission module seeded | High | seed.ts |

### D. Status Lifecycle

| Finding | Severity | Location |
|---|---|---|
| Comment lifecycle: OPEN→ACKNOWLEDGED→IN_PROGRESS→RESOLVED→VERIFIED→CLOSED | - | comment-state-machine.ts:19-27 |
| CLOSED only reachable from VERIFIED (system actor) - prevents premature closure | - | comment-state-machine.ts:114 |
| `closeVerifiedCommentsInTx` auto-closes VERIFIED comments on session approval | - | review-workflow.service.ts:1311-1341 |

### E. Frontend Completeness

| Finding | Severity | Location |
|---|---|---|
| `PmModuleKey` does NOT include `'review_comments'` | High | project-management.types.ts:677 |

### F. Permission Correctness

| Finding | Severity | Location |
|---|---|---|
| No dedicated `review_comments` permissions seeded | High | seed.ts |

### G. Real-World Workflow Fit

| Finding | Severity | Location |
|---|---|---|
| Routing result is stored in intent event log only, not persisted on comment - comment escalation routing is advisory only | Medium | review-workflow.service.ts:337-342 |

---

## CROSS-MODULE CHECKS

### X1 - Document Number Sequences

| Finding | Severity | Location |
|---|---|---|
| Sequences seeded for: PURCHASE_ORDER, INVOICE, RFI, SUBMITTAL, ISSUE, PUNCH_ITEM, MEETING, CORRESPONDENCE, TASK | - | seed.ts:1139-1173 |
| **Missing sequence: RISK** - `riskIdCode` is user-supplied free text | High | seed.ts (no RISK entry) |
| **Missing sequence: DELIVERABLE** - no auto-number | High | seed.ts (no DELIVERABLE entry) |
| **Missing sequence: CHANGE_REQUEST** - uses COUNT-based approach with race condition | High | seed.ts, project-change-request.service.ts:328 |
| `DocumentNumberService` supports type-safe lookup but only the 9 seeded types are usable | - | document-number.service.ts |

### X2 - Soft-Delete Consistency

| Finding | Severity | Location |
|---|---|---|
| `Closeout` model has no `deletedAt`/`deletedBy` - cannot be soft-deleted | High | schema.prisma:2327-2350 |
| `CloseoutChecklistItem` model has no `deletedAt`/`deletedBy` | High | schema.prisma:2351-2369 |
| `TaskDependency` uses hard delete in service layer | Medium | schedule.service.ts:476 |
| `MeetingAgendaItem` and `MeetingAttendee` use hard delete | Medium | meetings.service.ts |
| Daily log child entities (workforce, equipment, visitors, incidents) use hard delete | Medium | daily-logs.service.ts:488 |
| `RfiResponse` has no soft-delete fields - responses are permanent once added | Low | schema.prisma |
| `TaskDependency` schema has no `deletedAt` field | Medium | schema.prisma |

### X3 - companyId Scoping

| Finding | Severity | Location |
|---|---|---|
| **No companyId on**: `DailyLog`, `Rfi`, `Risk`, `Issue`, `PunchItem`, `Meeting`, `Correspondence` - tenancy enforced only via project join | High | schema.prisma (multiple models) |
| **No companyId on**: `Task`, `Milestone` - tenancy via project join | High | schema.prisma:1355, 1332 |
| `getCloseoutRecordOrThrow` has no companyId and no soft-delete filter | High | closeout.service.ts:291 |
| `listTeam` in projects.service.ts has no companyId check | High | projects.service.ts:310 |
| Deliverable and ChangeRequest services properly use companyId | - | deliverable.service.ts:215, project-change-request.service.ts:315 |

### X4 - Frontend/Backend Transition Map Alignment

| Finding | Severity | Location |
|---|---|---|
| **MISMATCH**: `TASK_VALID_TRANSITIONS.DELAYED` in frontend = `['IN_PROGRESS', 'COMPLETED']`; backend = `['IN_PROGRESS', 'NOT_STARTED']` - frontend allows DELAYED→COMPLETED, backend forbids it | High | pm-status-transitions.ts:9, schedule.service.ts:290 |
| RFI transitions: frontend matches backend exactly | - | pm-status-transitions.ts:14-20, rfis.service.ts:185-190 |
| Submittal direct transitions: frontend matches backend `SUBMITTAL_STATUS_TRANSITIONS` map | - | pm-status-transitions.ts:30-41, submittals.service.ts:58-62 |

### X5 - Permission Module Key Consistency

| Finding | Severity | Location |
|---|---|---|
| `ChangeRequestsController` uses `'projects'` permission module - no dedicated `change_requests` module exists | High | change-requests.controller.ts, seed.ts |
| `DeliverablesController` uses `'schedule'` permission module - no dedicated `deliverables` module exists | High | deliverables.controller.ts, seed.ts |
| Frontend `PmModuleKey` union type missing: `deliverables`, `changeRequests`, `engineeringDocuments`, `designPackages`, `reviewSessions`, `reviewComments` | High | project-management.types.ts:677-689 |
| `PM_MODULE_KEYS` array missing same 6 keys - capability fetch/normalize ignores EPC submodules entirely | High | project-management.types.ts:700-713 |
| Backend seed `PM_MODULES` also missing: `engineering_documents`, `design_packages`, `review_sessions`, `review_comments`, `deliverables`, `change_requests` | High | seed.ts:253-266 |
| General Manager and Project Director appear in both `DESIGN_WORKFLOW_ROLES` and `reportsOnlyRoleNames` - processed twice, potential duplicate permission rows | Medium | seed.ts:39-46, 787 |

### X6 - Orphaned Service Methods

| Finding | Severity | Location |
|---|---|---|
| `DeliverableService` is NOT exported in `ProjectManagementModule.exports` | High | project-management.module.ts |
| `PermissionsGuard`: if no `@RequirePermission` decorator is present on an endpoint, the guard returns `true` - undecorated endpoints are implicitly open to any authenticated user | Critical | permissions.guard.ts:36-37 |
| `WorkflowKernelService` injects `PermissionService` with `@Optional()` - if service is absent, admin reassignment always throws Forbidden | Medium | workflow-kernel.service.ts:97 |

### X7 - Missing Test Coverage

| Finding | Severity | Location |
|---|---|---|
| Spec files exist for: `edv-state-machine.spec.ts`, `comment-state-machine.spec.ts`, `workflow-kernel.service.spec.ts`, `permission-context-builder.spec.ts`, `review-sla.service.spec.ts`, `definition-of-done.service.spec.ts`, `review-routing.service.spec.ts` | - | domain/, application/services/ |
| **No spec files found for**: `rfis.service`, `submittals.service`, `daily-logs.service`, `meetings.service`, `correspondence.service`, `risks.service`, `issues.service`, `punch-items.service`, `closeout.service`, `deliverable.service`, `project-change-request.service`, `projects.service`, `schedule.service` | High | application/services/ |
| Integration test coverage for PM module services appears absent | High | backend/ |

---

## FINAL AUDIT SUMMARY TABLE

| Module | Critical | High | Medium | Low |
|---|---|---|---|---|
| Projects | 0 | 4 | 3 | 2 |
| Schedule | 0 | 5 | 3 | 1 |
| RFIs | 0 | 4 | 0 | 1 |
| Submittals | 0 | 4 | 2 | 0 |
| Daily Logs | 0 | 4 | 2 | 0 |
| Meetings | 0 | 3 | 3 | 0 |
| Correspondence | 0 | 3 | 1 | 0 |
| Risks | 0 | 3 | 2 | 0 |
| Issues | 0 | 3 | 1 | 0 |
| Punch List | 0 | 4 | 0 | 0 |
| Closeout | 0 | 5 | 2 | 0 |
| Change Requests | 2 | 5 | 2 | 0 |
| Deliverables | 0 | 5 | 0 | 0 |
| EPC Eng. Docs | 0 | 4 | 0 | 0 |
| EPC Design Packages | 0 | 3 | 1 | 0 |
| EPC Review Sessions | 0 | 3 | 2 | 1 |
| EPC Review Comments | 0 | 2 | 2 | 1 |
| Cross-Module X1 (Sequences) | 0 | 3 | 0 | 0 |
| Cross-Module X2 (Soft-delete) | 0 | 2 | 4 | 1 |
| Cross-Module X3 (companyId) | 0 | 5 | 0 | 0 |
| Cross-Module X4 (Transitions) | 0 | 1 | 0 | 0 |
| Cross-Module X5 (Perm. Keys) | 0 | 5 | 1 | 0 |
| Cross-Module X6 (Orphaned) | 1 | 2 | 1 | 0 |
| Cross-Module X7 (Tests) | 0 | 2 | 0 | 0 |
| **TOTAL** | **3** | **88** | **32** | **7** |

---

## PRIORITY FIX LIST

### Critical (fix before any production deployment)

1. **`PermissionsGuard` implicit open** - undecorated endpoints allow any authenticated user through. Every new controller endpoint is a security hole until explicitly decorated.
   `permissions.guard.ts:36-37`

2. **`approveChangeRequest` accepts any status** - a CLOSED or REJECTED change request can be re-approved.
   `project-change-request.service.ts:155`

3. **`seed-pm-demo.ts` seeds `ProjectTeamRole` values on `ProjectTeam`** - the `ProjectTeam` schema has no `role` column; this will fail at runtime or silently ignore the role.
   `schema.prisma:1312-1331, seed-pm-demo.ts`

### High (fix before beta)

4. **`ProjectTeam` missing `@@unique([projectId, userId])`** - allows duplicate memberships; inflates team counts and permission checks.
   `schema.prisma:1312`

5. **`POST /rfis/:rfiId/responses` uses `view` permission** - any user with RFI view access can post official responses.
   `rfis.controller.ts:109`

6. **`POST /submittals/:id/reviews` uses `view` permission** - same issue.
   `submittals.controller.ts:172`

7. **`TASK_VALID_TRANSITIONS.DELAYED` frontend mismatch** - frontend allows DELAYED→COMPLETED; backend rejects it.
   `pm-status-transitions.ts:9`

8. **`EngineeringDocument.documentNumber` is optional** - formal document control requires mandatory document numbers.
   `schema.prisma:1463`

9. **`generateChangeNumber` race condition** - concurrent inserts can produce duplicate `changeNumber` values.
   `project-change-request.service.ts:328`

10. **`schedule.canView` grants all review governance actions** - every user with schedule read access can attempt session approve/return; discipline assignment is the only real gate.
    `permission-resolver.service.ts:179-183`

11. **`Closeout` and `CloseoutChecklistItem` have no soft-delete fields** - inconsistent with the rest of the schema.
    `schema.prisma:2327-2369`

12. **`getCloseoutRecordOrThrow` bypasses companyId and soft-delete** - unscoped lookup.
    `closeout.service.ts:291`

13. **`DeliverableService` not exported** - cannot be injected by other modules.
    `project-management.module.ts`

14. **Missing permission modules for change_requests, deliverables, engineering_documents, design_packages, review_sessions, review_comments** - 6 modules share borrowed permissions.
    `seed.ts:253-266`

15. **Frontend `PmModuleKey` and `PM_MODULE_KEYS` missing 6 EPC/new modules** - capability normalization ignores these modules entirely.
    `project-management.types.ts:677-713`

16. **Punch item self-certification gap** - raiser can verify their own item; no guard exists.
    `punch-items.service.ts`

17. **N+1 `ensureRfiFolder` on RFI list** - one DB call per RFI on every list fetch.
    `rfis.service.ts:341-367`

18. **No cycle detection for task dependencies** - circular dependency is storable.
    `schedule.service.ts:376-403`

19. **Missing sequences for RISK, DELIVERABLE, CHANGE_REQUEST** - user-supplied IDs or COUNT-based generation for governance documents.
    `seed.ts`

20. **13 PM services have no test coverage** - rfis, submittals, daily-logs, meetings, correspondence, risks, issues, punch-items, closeout, deliverable, change-request, projects, schedule.
    `application/services/`
