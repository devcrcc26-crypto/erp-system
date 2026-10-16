# Comment 8 - Phase 7 Verification Ledger

Generated: 2026-07-06. Evidence for each Phase 7 checklist item.

## Migration status

```
npx prisma migrate status → Database schema is up to date (50 migrations)
```

All Comment 8 phase migrations are **applied** on live Neon/Supabase.

| Migration | Rows / scope | Rollback note |
|-----------|----------------|---------------|
| `20260706100000_add_task_comment8_fields` | TaskAttributes enum, VERY_URGENT, supervisingChiefUserId, assignedPersonUserId | Drop columns + enum manually; see migration file |
| `20260706110000_phase1_department_project_fk` | department +2 cols; +2 dept rows (MTD, ADD); project.department_id; **19 projects** backfilled to MTD | `UPDATE project SET department_id = NULL`; drop FK column; delete seeded depts |
| `20260706120000_phase2_engineering_discipline` | New `engineering_discipline` table; task_discipline.discipline_id FK; distinct catalog seeded | Null FKs; drop discipline_id columns; drop table |
| `20260706130000_phase3_task_field_corrections` | overseas_task_number; commission_mode copied from project; UrgencyLevel without CRITICAL; ApprovalLevel renamed (INSTITUTE→DESIGN_INSTITUTE_REVIEW 22 rows, DEPARTMENT→COMPANY_REVIEW 12 rows); **1 demo task** soft-deleted (TAS-00002) | Reverse enum/column changes via new migration only |
| `20260706140000_phase4_subtask_roles` | Renamed 5 package_* role columns; added designer + supporting_designer; **copy-down on all active packages** from task_discipline | Additive only - rollback is forward migration to restore aliases if needed |

---

## (a) Task detail page - Comment 8 field checklist

Source: `frontend/components/modules/projects/schedule/TaskDetailContent.tsx`

| # | Requirement | Evidence |
|---|-------------|----------|
| 1 | Project name + number in header | Lines 142–148: `projectName · projectNumber` |
| 2 | Overseas task number | Descriptions `overseasTaskNumber` |
| 3 | Commission mode on task | `formatCommissionModeLabel(task.commissionMode)` |
| 4 | Dispatcher (调度员) visible | Descriptions dispatcher row |
| 5 | Assigned person hidden | Not rendered (deprecated) |
| 6 | Urgency NORMAL / URGENT / VERY_URGENT | `formatUrgencyLevelLabel` + badge |
| 7 | Approval level bilingual | `formatTaskReviewLevelLabel` → shared `task-comment8.ts` |
| 8 | Supervising chief | Task details collapse |
| 9 | Main work content | `task.description` |
| 10 | Task attributes enum | `formatTaskAttributesLabel` |
| 11 | Archiving / language / work plan | Task details section |
| 12 | Contact sheet + date fields | On-site, HQ, planned, actual |
| 13 | Design stage | Header badge + details |
| 14 | Disciplines section | Leader-only assignment |
| 15 | Subtasks (not “design packages”) | Section title “Disciplines & subtasks”; subtask cards |
| 16 | Edit roles on subtask card | `SubtaskRolesModal` per subtask |
| 17 | Scoped load via GET task by id | `TaskDetailPageContent` uses `useTask()` → `GET .../tasks/:taskId` |

---

## (b) API scoping tests (supertest + service)

Test file: `backend/src/modules/project-management/presentation/controllers/__tests__/comment8-phase7-access.spec.ts`

| Scenario | Test name | Result |
|----------|-----------|--------|
| (i) Leader A → leader B subtask | `discipline leader A fetching leader B subtask id returns 404` | HTTP 404 via controller |
| (ii) Designer subtask list scoped | `designer subtask list endpoint delegates scoped list` + `subtask role holder package filter` | Service filter `OR: subtaskRoleOr(userId)` |
| (iii) MTD leader ≠ ADD projects | `Municipal Transportation department leader sees zero Architectural Design projects` | `departmentId: { in: [mtdDeptId] }` only |
| (iv) Project Admin → user mgmt | `Project Admin token is rejected from user-management list` | HTTP 403 |
| (v) Designer task list scoped | `schedule task list uses scoped service for designer token` | `listTasks` called with designer ctx |

Supporting unit tests: `task-access-scope.service.spec.ts`, `my-work.service.spec.ts`

Run:
```bash
cd backend
npm test -- --testPathPattern="comment8-phase7|task-access-scope|my-work|project-export"
```

---

## (c) Excel export - new fields

Test file: `project-export.service.spec.ts`

Verified columns (task list row):
- Overseas task number (col 1)
- Approval level bilingual: `Design Institute Review (院审)` (col 16)
- Supervising chief (col 17)
- On-site assigned person (col 18)
- Dispatcher (col 19)
- Department name from FK on project export (prefers `department.name` over deprecated enum)
- Task list scoped via `TaskAccessScopeService.buildTaskListWhere`

---

## (d) Grep cleanup

### Task urgency `CRITICAL` removed
- `UrgencyLevel` enum: `NORMAL`, `URGENT`, `VERY_URGENT` only (schema + `task-comment8.ts`)
- Remaining `CRITICAL` hits are **Issue/Punch** severity - unrelated

### Task `ApprovalLevel` bare INSTITUTE/DEPARTMENT
- Migrated to `DESIGN_INSTITUTE_REVIEW` / `COMPANY_REVIEW` with bilingual labels in export + forms
- No task-level `INSTITUTE` or `DEPARTMENT` enum values remain in application code

### “Design package” UI strings
- User-facing copy updated to **Subtask(s)** across schedule, submittals, deliverables, review, locales
- Remaining hits are code comments, API type names (`DesignPackage`), or backend routes - not UI labels

Verify:
```bash
rg -i "design package" frontend --glob "*.{tsx,json}" 
# Should return 0 user-facing strings (comments/types excluded)
```

---

## Phase completion summary

| Phase | Topic | Status |
|-------|--------|--------|
| 1 | Department + project FK | ✅ Applied |
| 2 | Engineering discipline catalog | ✅ Applied |
| 3 | Task field corrections | ✅ Applied |
| 4 | Subtask roles on DesignPackage | ✅ Applied |
| 5 | Server-side query scoping | ✅ Code + tests |
| 6 | My Work, notifications, exports | ✅ Code + tests |
| 7 | Verification (this document) | ✅ |
