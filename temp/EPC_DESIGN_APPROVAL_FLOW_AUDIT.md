# EPC Design Approval Flow - Complete Code Audit

**Audit date:** 2026-06-26  
**Branch:** main  
**Auditor:** Claude Sonnet 4.6 (read-only, no code changes)  
**Files examined:** schema.prisma, edv-state-machine.ts, comment-state-machine.ts, permission-context-builder.ts, workflow-kernel.service.ts, review-workflow.service.ts, permission-resolver.service.ts, definition-of-done.service.ts, revision-orchestrator.service.ts, schedule.service.ts, projects.service.ts, review-sla.service.ts, review-routing.service.ts, review-tier.enum.ts

---

## PART 1 - TIER CHAIN

### 1.1 - The Tier Actors

> **Critical finding:** The `ReviewTier` enum (schema.prisma:1217–1223) contains **only four tiers**, not five. There is no `DEPUTY_CHIEF_ENGINEER` or `INSTITUTE_CHIEF_ENGINEER` anywhere in the codebase. `REVIEW_TIER_ORDER` in review-tier.enum.ts:8–13 confirms exact order:
> ```
> [DISCIPLINE_OWNER, REVIEWER, DISCIPLINE_LEAD, DEPT_CHIEF]
> ```

| Tier | Enum value | TaskDiscipline field | FK or String? | Action to advance | Permission flag (schedule module) | Layer 3 check | SLA |
|------|-----------|---------------------|--------------|-------------------|------------------------------------|---------------|-----|
| Designer | *(not in ReviewTier)* | `designerUserId` (schema.prisma:1428) | User FK | `ENGINEERING_DOCUMENT_VERSION_UPLOAD` + `DESIGN_PACKAGE_SUBMIT` | `schedule.canCreate` or `schedule.canEdit` (permission-resolver.service.ts:158–169) | `DESIGNER_ACTIONS` set; match on `disciplineDesignerUserId` (permission-context-builder.ts:169–175) | N/A |
| Discipline Owner | `DISCIPLINE_OWNER` | `ownerUserId` (schema.prisma:1429) | User FK | `REVIEW_SESSION_APPROVE` | `schedule.canApprove` (permission-resolver.service.ts:171–176) | `REVIEW_TIER_ACTIONS` set; match on any of owner/reviewer/lead/chief/assignee (permission-context-builder.ts:188–201) | 24 h (review-sla.service.ts:17) |
| Reviewer | `REVIEWER` | `reviewerUserId` (schema.prisma:1430) | User FK | `REVIEW_SESSION_APPROVE` | `schedule.canApprove` | Same Layer 3 check | 48 h (review-sla.service.ts:18) |
| Discipline Lead | `DISCIPLINE_LEAD` | `disciplineLeadUserId` (schema.prisma:1431) | User FK | `REVIEW_SESSION_APPROVE` | `schedule.canApprove` | Same Layer 3 check | 72 h (review-sla.service.ts:19) |
| Dept Chief Engineer | `DEPT_CHIEF` | `chiefUserId` (schema.prisma:1432) | User FK | `REVIEW_SESSION_APPROVE` (final) + `ENGINEERING_DOCUMENT_VERSION_LOCK` | `schedule.canApprove` | Same Layer 3 for approve; `CHIEF_ACTIONS` set; match only on `disciplineChiefUserId` for lock (permission-context-builder.ts:178–184) | 120 h (review-sla.service.ts:20) |

**Dual-name gap (D3):** Each FK field has a redundant plain-string mirror on `TaskDiscipline`:

| FK field | Name string mirror |
|----------|--------------------|
| `designerUserId` | `designerName` (schema.prisma:1423) |
| `ownerUserId` | `disciplineOwnerName` (schema.prisma:1427) |
| `reviewerUserId` | `reviewerName` (schema.prisma:1424) |
| `disciplineLeadUserId` | `disciplinaryLeader` (schema.prisma:1425) |
| `chiefUserId` | `deptChiefEngineer` (schema.prisma:1426) |

Layer 3 enforcement reads **only** the `*UserId` FK fields (permission-context-builder.ts:169–201). If a discipline is configured with only name strings and no FK, the Layer 3 check will deny all workflow actions for that tier.

---

### 1.2 - How a Session Advances from One Tier to the Next

**Method:** `ReviewWorkflowService.approveReviewSession` (review-workflow.service.ts:657)

#### Non-final tier approval - exact DB write order (review-workflow.service.ts:707–772)

1. **Auto-close VERIFIED comments** → `closeVerifiedCommentsInTx` (line 707); system actor transitions VERIFIED → CLOSED.
2. **Revert premature APPROVED EDVs → IN_REVIEW** → `revertPrematureEdvApprovalsInTx` (lines 713–723). Any EDV already in APPROVED status is reverted to IN_REVIEW. This guards against `BatchApproveEdvs` being called before the final tier.
3. **Current tier's `TaskDisciplineReview` → APPROVED** (lines 725–731, via `upsertTaskDisciplineReviewInTx`).
4. **`ReviewSession.currentTier` advances immediately** → `advanceActiveSessionTierInTx` (lines 733–739). Updates `currentTier = nextTier`, sets `assignedToUserId` to the next tier's FK user, computes new `slaDeadlineAt`. Written in the same transaction - **not deferred**.
5. **Next tier's `TaskDisciplineReview` → IN_REVIEW** (lines 741–748).
6. **`DesignPackage.projectionPending = true`** (lines 750–753).
7. **StateProjection recomputed** (lines 755–759).

#### Confirmed: APPROVED EDVs revert to IN_REVIEW at non-final tier

`revertPrematureEdvApprovalsInTx` (review-workflow.service.ts:1100–1144) explicitly filters EDVs with `status === EdvStatus.APPROVED` and transitions them back to `IN_REVIEW`. This runs for every non-final tier approval. The audit report noted this correctly.

#### Final tier (DEPT_CHIEF) approval - DB write order (review-workflow.service.ts:775–862)

1. **DEPT_CHIEF `TaskDisciplineReview` → APPROVED** (lines 775–781).
2. **`ReviewSession.status → APPROVED`, `outcome → APPROVED`, `closedAt` set** (lines 783–788).
3. **`WorkflowEventLog` `APPROVE_REVIEW_SESSION`** (lines 790–799).
4. **All IN_REVIEW EDVs → APPROVED** (lines 801–845, using `edvTransitionService.applyInTx` with `REVIEW_SESSION_BATCH_APPROVE` action override).
5. **StateProjection recomputed** (lines 847–851).

---

### 1.3 - Guards Running Before a Tier Can Approve

All guards run inside `approveReviewSession` before any DB write, in order:

| # | Guard method | What it checks | Exception thrown on failure | File:line |
|---|--------------|---------------|----------------------------|-----------|
| 1 | `findSessionById` + status check | Session must exist and be `ACTIVE` | `NotFoundException` | review-workflow.service.ts:662–669 |
| 2 | `assertActorMatchesReviewTier` | Actor's `userId` must match the discipline FK for the session's `currentTier` (via `resolveAssigneeForTier`) | `ForbiddenException('Actor role does not match current review tier.')` | review-workflow.service.ts:676–680 |
| 3 | `definitionOfDone.assertPackageApprovalAllowed` | No comment in OPEN, ACKNOWLEDGED, IN_PROGRESS, or RESOLVED status | `ConflictException('Approval blocked: all comments must be VERIFIED or CLOSED')` | review-workflow.service.ts:687–688; definition-of-done.service.ts:16–24 |
| 4 | `definitionOfDone.assertSessionCloseAllowed` | All comments must be VERIFIED or CLOSED | `ConflictException('Session cannot close until all comments are VERIFIED or CLOSED')` | review-workflow.service.ts:690–692; definition-of-done.service.ts:29–37 |
| 5 | `permissionResolver.assertActionAllowed` (`REVIEW_SESSION_APPROVE`) | Full 5-layer permission check (system role, project team, discipline assignment, design phase, workflow state) | `ForbiddenException('Permission denied for action...')` | review-workflow.service.ts:694–705 |

---

### 1.4 - What Happens at the Final Tier (DEPT_CHIEF)

**Apex tier:** `ReviewTier.DEPT_CHIEF` - index 3 in `REVIEW_TIER_ORDER` of length 4 (review-tier.enum.ts:8–13).  
`isFinalTier = tierIndex >= REVIEW_TIER_ORDER.length - 1` evaluates to `true` for `DEPT_CHIEF` (review-workflow.service.ts:710).

**Difference from intermediate tiers:** `revertPrematureEdvApprovalsInTx` is NOT called. The session is closed (status = APPROVED) rather than its `currentTier` advancing. EDV transitions happen inline rather than deferring to a separate `BatchApproveEdvs` call.

**BatchApproveEdvs (standalone command):** Guarded to DEPT_CHIEF only (workflow-kernel.service.ts:307: `if (session.currentTier !== ReviewTier.DEPT_CHIEF) throw ConflictException`). This is **not called automatically** by `approveReviewSession`. It is a separate, optional action. EDVs set to APPROVED via this path before the final `approveReviewSession` call are **not reverted** (since `revertPrematureEdvApprovalsInTx` only runs at non-final tiers) and are **not re-processed** by final-tier approval (which only processes `IN_REVIEW` EDVs).

**Valid EDV inputs to final-tier `approveReviewSession`:** Only `IN_REVIEW` (line 821 - `assertBatchTransitionPlan` with `[EdvStatus.IN_REVIEW]` as valid sources).

| After final-tier approval | New value |
|--------------------------|-----------|
| EDV status (IN_REVIEW only) | `APPROVED` |
| ReviewSession.status | `APPROVED` |
| ReviewSession.outcome | `APPROVED` |
| ReviewSession.closedAt | `new Date()` |
| DesignPackage.projectedStatus | Recomputed by `StateProjectionService` - state-projection.service.ts **not provided**, exact value NOT DETERMINABLE from provided files |

---

### 1.5 - Intentional Skipping of Approval Tiers

**Is there any tier-skipping mechanism?** **NO.**

Evidence:

- `REVIEW_TIER_ORDER` is a fixed, unconditional array - no conditional removal of tiers (review-tier.enum.ts:8–13).
- `advanceActiveSessionTierInTx` always uses `REVIEW_TIER_ORDER[tierIndex + 1]` - increments by exactly 1 (review-workflow.service.ts:1267).
- No `WorkflowKernel` command jumps more than one tier. The only tier-transition commands are `ApproveReviewSession` (advances by 1) and `ReturnPackageForRework` (closes session entirely; resubmission restarts at `DISCIPLINE_OWNER`).

**Is there a bypass flag or admin override in permission-context-builder.ts?**  
No `isAdmin`, `bypassTier`, or exempt-role flag exists. However, Layer 3 (`evaluateDisciplineAssignmentLayer`, permission-context-builder.ts:187–201) passes for **any** of the four discipline tier users regardless of which tier is currently active. Tier-specific enforcement is separately handled by `assertActorMatchesReviewTier` in `approveReviewSession` and `returnPackageForRework`, but **not** for `BatchReturnEdvs`.

**Does comment severity routing skip tiers?**  
NO. `ReviewRoutingService.route()` computes `escalate=true` and `nextTier` for MAJOR/MODERATE comments (review-routing.service.ts:24–64), but this result is written to `WorkflowEventLog.afterState` only (review-workflow.service.ts:362–370). It has zero effect on session tier, approval requirements, or which tiers must review.

**Does admin reassignment skip tiers?**  
NO. `reassignReviewSession` (workflow-kernel.service.ts:162–221) changes only `assignedToUserId` - it does NOT change `currentTier`.

**Explicit conclusion:** Tier skipping is **not possible** through any code path in the provided files.

---

## PART 2 - BACKWARD FLOW

### 2.1 - How Comments Are Raised During Review

**Method:** `ReviewWorkflowService.addReviewComment` (review-workflow.service.ts:293)

**Required fields:**

| Field | Validation |
|-------|-----------|
| `reviewSessionId` | Session must exist and be ACTIVE (line 303–305) |
| `engineeringDocumentVersionId` | EDV must exist with comment-eligible status (line 307–316) |
| `body` OR `commentDocumentVersionId` | At least one required (lines 318–322) |
| `severity` | `MINOR` / `MODERATE` / `MAJOR` |
| `assignedToUserId` | Required; no validation that assignee matches a discipline FK |
| `actorId` | Must pass `REVIEW_COMMENT_ASSIGN` permission check |

**Who can raise a comment:** Any user with `schedule.canEdit` (permission-resolver.service.ts:167) whose `userId` matches any of `disciplineOwnerUserId`, `disciplineReviewerUserId`, `disciplineLeadUserId`, `disciplineChiefUserId`, or `currentAssigneeUserId` (Layer 3, permission-context-builder.ts:188–201). There is **no check** that only the current tier's assignee may comment. A `DISCIPLINE_LEAD` can raise a comment while the session is at `DISCIPLINE_OWNER` tier.

**Comment severity routing** (review-routing.service.ts:24–64):

| Severity | `escalate` | `nextTier` | `requiresLeadApproval` | Actual effect |
|----------|-----------|-----------|----------------------|--------------|
| MINOR | `false` | `currentTier` | `false` | None - logged only |
| MODERATE | `true` if at DISCIPLINE_OWNER | REVIEWER if at DISCIPLINE_OWNER, else currentTier | `true` if at REVIEWER | None - logged only |
| MAJOR | `true` (if not at final tier) | Next tier in order | `true` | None - logged only |

The routing result is written to `WorkflowEventLog.afterState` only (review-workflow.service.ts:362–370). It does **not** change session tier, block approval, or trigger any state change.

**Can a higher-tier reviewer comment on a document at a lower tier?** YES - no enforcement prevents this.

---

### 2.2 - Comment State Machine

**Source:** comment-state-machine.ts

**Status values:** `OPEN`, `ACKNOWLEDGED`, `IN_PROGRESS`, `RESOLVED`, `VERIFIED`, `CLOSED`

| From status | To status | Actor required | What enforces this |
|-------------|----------|---------------|-------------------|
| `OPEN` | `ACKNOWLEDGED` | `designer` or `reviewer` | `COMMENT_TRANSITIONS` line 22; `ACTOR_ALLOWED_TARGETS` lines 34–44 |
| `ACKNOWLEDGED` | `IN_PROGRESS` | `designer` or `reviewer` | `COMMENT_TRANSITIONS` line 23 |
| `IN_PROGRESS` | `RESOLVED` | `designer` only | `COMMENT_TRANSITIONS` line 24; `RESOLVED` not in reviewer's allowed targets |
| `RESOLVED` | `VERIFIED` | `reviewer` only | `COMMENT_TRANSITIONS` line 25; `VERIFIED` not in designer's allowed targets (line 33–37) |
| `RESOLVED` | `IN_PROGRESS` | `designer` or `reviewer` | `COMMENT_TRANSITIONS` line 25 |
| `VERIFIED` | `CLOSED` | `system` only | `ACTOR_ALLOWED_TARGETS` line 43; extra guard line 114–120 |
| `CLOSED` | *(any)* | - | TERMINAL - `TERMINAL_COMMENT_STATUSES` (line 47–49) |

**Actor role resolution** (`resolveCommentActor`, review-workflow.service.ts:1370–1399):

| Condition | Resolved as |
|-----------|------------|
| `comment.assignedToUserId === userId` OR `discipline.designerUserId === userId` | `'designer'` |
| userId matches `ownerUserId`, `reviewerUserId`, `disciplineLeadUserId`, `chiefUserId`, or `comment.createdBy` | `'reviewer'` |
| No match | `ForbiddenException` |

This is a **context-based role**, not a system role. The same user can be `'designer'` on one comment and `'reviewer'` on another within the same session.

**What happens when a designer tries to verify:**  
`canTransitionCommentStatus` returns `ACTOR_NOT_PERMITTED` because `CommentStatus.VERIFIED` is not in `designer`'s `ACTOR_ALLOWED_TARGETS` (comment-state-machine.ts:104–110).

**When is a comment auto-closed:**  
Only inside `closeVerifiedCommentsInTx` (review-workflow.service.ts:1311–1341), which runs as the **first DB write** inside `approveReviewSession`. VERIFIED → CLOSED uses the `'system'` actor. This is the **only path** to `CLOSED`.

---

### 2.3 - What Blocks Tier Approval When Comments Are Unresolved

**Method called before approval:**  
`definitionOfDone.assertPackageApprovalAllowed` (review-workflow.service.ts:687) then `assertSessionCloseAllowed` (line 690).

**Blocking statuses** (`APPROVE_BLOCKING_STATUSES`, comment-state-machine.ts:56–61):

| Status | Blocks approval? |
|--------|-----------------|
| `OPEN` | YES |
| `ACKNOWLEDGED` | YES |
| `IN_PROGRESS` | YES |
| `RESOLVED` | YES |
| `VERIFIED` | NO |
| `CLOSED` | NO |

**Can a reviewer return for rework without resolving comments?**  
YES. `returnPackageForRework` (review-workflow.service.ts:868) has no comment status check - only `assertActorMatchesReviewTier` is called (line 890–894). Comments remain in whatever state they are in.

**What happens to unresolved comments when returned:**  
They remain in their current status (`OPEN`, `ACKNOWLEDGED`, `IN_PROGRESS`, `RESOLVED`). The session changes to `RETURNED_FOR_REWORK` but comments are not auto-closed, auto-resolved, or affected.

---

### 2.4 - Return for Rework - Exact Sequence

**Method:** `ReviewWorkflowService.returnPackageForRework` (review-workflow.service.ts:868)

**Is a reason string required?**  
Accepted as `command.reason` (used as `closedReason`, line 918). No minimum length enforced (unlike `reassignReviewSession` which requires ≥ 10 characters). Can be empty string.

**Exact DB write order:**

1. **`TaskDisciplineReview` → RETURNED** for current tier (lines 905–911).
2. **`ReviewSession.status → RETURNED_FOR_REWORK`**, `outcome → RETURNED`, `closedAt` set, `closedReason` set (lines 913–919).
3. **`WorkflowEventLog` `RETURN_FOR_REWORK`** (lines 921–934).
4. **IN_REVIEW EDVs → DRAFT** (lines 943–961). Only EDVs with `status === IN_REVIEW` are reverted. APPROVED EDVs are **not** reverted here.
5. **StateProjection recomputed** (lines 963–966).

**After rework - which tier does the new session start at?**  
Always `DISCIPLINE_OWNER`. `submitPackageForReview` hardcodes `currentTier: ReviewTier.DISCIPLINE_OWNER` (review-workflow.service.ts:213). The full four-tier chain restarts.

**Does the system require all comments addressed before resubmission?**  
Partially. `submitPackageForReview` (lines 150–156) throws `BadRequestException` if any comment from the previous session is `OPEN` or `IN_PROGRESS`. However, `ACKNOWLEDGED` and `RESOLVED` comments **do not block resubmission**. The error message says "must be acknowledged" but ACKNOWLEDGED, RESOLVED, VERIFIED, and CLOSED all pass.

---

### 2.5 - Document Version Tracking Through Rework Cycles

**When a designer revises a document after rework:**  
`TriggerRevision` → `RevisionOrchestratorService.triggerRevision` (revision-orchestrator.service.ts:50).

| Action | Detail |
|--------|--------|
| New EDV created | DRAFT status, `revisionLabel = String(existingVersions.length)` (line 134) |
| Previous non-LOCKED/non-SUPERSEDED versions | Transitioned to SUPERSEDED (lines 113–131) |
| LOCKED source EDV | Preserved; its `documentVersionId` is reused on the new DRAFT (line 139) |

> Note: `triggerRevision` is the **external revision path** (RFI / Change Request). For the internal rework path, `returnPackageForRework` reverts `IN_REVIEW → DRAFT` and the same EDV row is re-used - no new EDV row is created.

**Can two DRAFT EDVs exist simultaneously for the same `EngineeringDocument`?**  
NO. `validateNewRevisionUpload` (edv-state-machine.ts:121–144) returns `ACTIVE_DRAFT_EXISTS` if `existingEdvStatuses.includes(EdvStatus.DRAFT)` (lines 126–132). Enforced in `triggerRevision` (revision-orchestrator.service.ts:95–101).

**How does the system know which EDV is "current"?**  
There is **no `isCurrent` flag** on `EngineeringDocumentVersion` (schema.prisma:1493–1520). The current version must be inferred from status and date. No explicit pointer exists.

**Is version history accessible via GET endpoint?**  
Controller files were not provided. **NOT FOUND in provided files.**

**WorkflowEventLog events written per lifecycle stage:**

| Stage | Event name | Location |
|-------|-----------|----------|
| Package submitted | `SUBMIT_PACKAGE_FOR_REVIEW` | review-workflow.service.ts:231 |
| Comment raised | `ADD_REVIEW_COMMENT` | review-workflow.service.ts:353 |
| Comment status change | `COMMENT_{from}_TO_{to}` | review-workflow.service.ts:455 |
| Comment removed | `REMOVE_REVIEW_COMMENT` | review-workflow.service.ts:527 |
| Comment updated | `UPDATE_REVIEW_COMMENT` | review-workflow.service.ts:623 |
| Tier advanced | `ADVANCE_REVIEW_TIER` | review-workflow.service.ts:738 |
| Session approved | `APPROVE_REVIEW_SESSION` | review-workflow.service.ts:791 |
| Package returned | `RETURN_FOR_REWORK` | review-workflow.service.ts:927 |
| External revision | `TRIGGER_REVISION` | revision-orchestrator.service.ts:150 |
| Session reassigned | `SESSION_REASSIGNED` | workflow-kernel.service.ts:207 |
| Every EDV transition | INTENT event per transition | via `edvTransitionService.applyInTx` |

---

## PART 3 - DESIGN PACKAGE COMPLETION AND CLOSURE

### 3.1 - When Are All EDVs in a Package Considered Approved?

`DesignPackage.projectedStatus` is a **stored field** (schema.prisma:1527) of type `DesignPackageProjectedStatus`.

Values: `IN_PROGRESS`, `PENDING_LEAD`, `APPROVED`, `REWORK_REQUIRED` (schema.prisma:1127–1133). There is **no `LOCKED` value** in this enum.

Recomputation is triggered by `StateProjectionService.recomputeDirtyInTx`, called transactionally after every workflow mutation. The `projectionPending` flag (schema.prisma:1528) is set to `true` on intermediate-tier approval (review-workflow.service.ts:750–753) to signal pending recomputation.

**The exact predicate for when `projectedStatus` becomes `APPROVED`** is in state-projection.service.ts, which was **not provided**. Cannot be cited from the available files.

---

### 3.2 - Locking the Package

**Command:** `LockPackageEdvs` → `WorkflowKernelService.executeLockPackageEdvs` (workflow-kernel.service.ts:382)

**Who can call it:**  
`ENGINEERING_DOCUMENT_VERSION_LOCK` is in `CHIEF_ACTIONS` (permission-context-builder.ts:83–85). Layer 3 requires `userId === disciplineChiefUserId` (lines 178–184). Permission requires `schedule.canApprove` (permission-resolver.service.ts:173). **Only the `chiefUserId` with `schedule.canApprove`** can lock.

**Pre-condition:**  
`assertPackageLockEligible` (workflow-kernel.service.ts:404–407) - all EDVs must be `APPROVED`. Mixed or partially approved packages cannot be locked.

**What happens to each EDV on lock:**  
`APPROVED → LOCKED` (lines 409–413, `assertBatchTransitionPlan` with `[EdvStatus.APPROVED]` as valid source).

**Is LOCKED terminal?**  
YES. edv-state-machine.ts:36–38: `TERMINAL_STATUSES = new Set([EdvStatus.LOCKED, EdvStatus.SUPERSEDED])`. Transition table line 32: `[EdvStatus.LOCKED]: []`. Any attempt to transition from LOCKED returns `LOCKED_IMMUTABLE` (line 71–73).

**DesignPackage.projectedStatus after lock:**  
Recomputed by `StateProjectionService`. The `DesignPackageProjectedStatus` enum has no `LOCKED` value - **NOT DETERMINABLE** from provided files (state-projection.service.ts not provided).

**Can a new DesignPackage be created under the same TaskDiscipline after lock?**  
No guard found in any provided file preventing this.

---

### 3.3 - Creating the Next Design Package

No constraint found in any provided service preventing immediate creation of a new `DesignPackage` under the same `TaskDiscipline` after the previous one is locked.

**Can a designer upload a new revision of a LOCKED EDV directly?**  
NO. LOCKED is terminal in the EDV state machine (edv-state-machine.ts:32, 36–38). The only valid path is `TriggerRevision` (external review trigger via RFI/CR/Submittal), which creates a new DRAFT EDV while leaving the LOCKED source intact (revision-orchestrator.service.ts:103–145).

---

### 3.4 - When Is a TaskDiscipline Considered Complete?

`TaskDiscipline` model fields relevant to completion (schema.prisma:1417–1465):

| Field | Type | Enforced? |
|-------|------|----------|
| `projectedStatus` | `TaskDisciplineProjectedStatus` | Computed by StateProjectionService |
| `actualCompletionTime` | `DateTime?` | Manually settable - no enforcement |
| `deptReviewTime` | `DateTime?` | Manually settable - no enforcement |

No `isComplete` boolean flag exists on `TaskDiscipline`.

`TaskDisciplineReview` rows track per-tier review status per session, but are session-scoped - they are not a final discipline completion indicator.

**Is there a formal "close discipline" action?**  
**NOT FOUND** in any provided service file. Discipline completion is **implicit** - all packages under the discipline being LOCKED, with no formal closure event.

---

## PART 4 - TASK CLOSURE

### 4.1 - How Is a Task Marked Complete?

**Method:** `ScheduleService.updateTask` (schedule.service.ts:323)

**Status transition guard** (`TASK_STATUS_TRANSITIONS`, schedule.service.ts:348–356):

| From | To (allowed) |
|------|-------------|
| `NOT_STARTED` | `IN_PROGRESS`, `DELAYED` |
| `IN_PROGRESS` | `COMPLETED`, `DELAYED`, `NOT_STARTED` |
| `DELAYED` | `IN_PROGRESS`, `NOT_STARTED` |
| `COMPLETED` | `IN_PROGRESS` *(intentional reopening for schedule corrections - comment at line 353–354)* |

**Check that child tasks are COMPLETED before parent COMPLETED?** NOT FOUND.  
**Check that TaskDisciplines are locked/complete before task COMPLETED?** NOT FOUND.  
**Self-certified or governed?** Self-certified. Any user with the appropriate RBAC edit permission can mark a task COMPLETED. No second-approver requirement.

---

### 4.2 - Connection Between TaskDiscipline State and Task Status

**Automatic Task transition when disciplines complete?** NOT FOUND in any provided file.  
**Guard in `updateTask()` checking discipline state?** NOT FOUND. `updateTask` (schedule.service.ts:323–398) has no discipline state query.  
**Are task lifecycle and EPC design workflow decoupled?** **YES.** Gap D5 from the prior audit is confirmed. The two systems share data (TaskDiscipline belongs to Task via FK) but no cross-system enforcement exists in the provided code.

---

### 4.3 - When All Tasks Are Complete

**Service method checking "all tasks COMPLETED"?** NOT FOUND in projects.service.ts or any provided file.  
**Automatic project status transition when all tasks complete?** NOT FOUND.  
**Project status is manual?** Partially. `updateProject` enforces `PROJECT_STATUS_TRANSITIONS` (projects.service.ts:42–50) so status order is controlled, but no entity-state gate exists before allowing `ACTIVE → COMPLETED` or `COMPLETED → CLOSED`.

---

## PART 5 - PROJECT COMPLETION

### 5.1 - What Gates Project Completion?

In `ProjectsService.updateProject` (projects.service.ts:200–263):

`PROJECT_STATUS_TRANSITIONS` (lines 42–50):

| From | To (allowed) |
|------|-------------|
| `PLANNING` | `TENDER`, `ON_HOLD` |
| `TENDER` | `MOBILIZATION`, `PLANNING`, `ON_HOLD` |
| `MOBILIZATION` | `ACTIVE`, `ON_HOLD`, `TENDER` |
| `ACTIVE` | `ON_HOLD`, `COMPLETED` |
| `ON_HOLD` | `PLANNING`, `TENDER`, `MOBILIZATION`, `ACTIVE` |
| `COMPLETED` | `CLOSED` |
| `CLOSED` | *(terminal)* |

**Does `assertProjectCloseoutReady()` exist?** NO - not found anywhere in projects.service.ts.  
**Does `updateProject` query any other entity type before status transition?** NO.  
**Conclusion:** Project completion is a **free-set** PATCH once the status transition rule is satisfied.

---

### 5.2 - The Closeout Module Connection

**FK between Closeout and Project:** `Closeout.projectId String @unique` (schema.prisma:2342) - one-to-one, enforced by unique constraint. `Project.closeout` relation exists (schema.prisma:1307).

**Check that Closeout status has reached a required stage before Project can close?**  
NOT FOUND. `updateProject` never queries the `Closeout` record.

**Are closeout checklist items linked to specific entities?**  
NO. `CloseoutChecklistItem` (schema.prisma:2367–2389) has:
- `category: String` - free text
- `description: String` - free text
- `isComplete: Boolean` - manually toggled
- No FK to `Task`, `PunchItem`, `Issue`, or any other entity

Checklist items are entirely free-text with no system enforcement.

---

### 5.3 - Full Completion Sequence

| # | What must happen | ENFORCED BY CODE or HONOUR SYSTEM |
|---|-----------------|----------------------------------|
| 1 | Designer uploads EDV (DRAFT created) | ENFORCED - Layer 1 (system role) + Layer 3 (designer FK match) + Layer 4 (design phase gate) |
| 2 | Designer creates DesignPackage and adds EDV items | HONOUR SYSTEM - no guard in provided files beyond RBAC |
| 3 | Designer submits package for review (DRAFT → IN_REVIEW, session opens at DISCIPLINE_OWNER) | ENFORCED - permission check, conflict guard, dependency check, prior-comment acknowledgment check |
| 4 | DISCIPLINE_OWNER reviews within SLA | HONOUR SYSTEM - SLA is notification-only, never blocks |
| 5 | DISCIPLINE_OWNER approves → REVIEWER tier activates | ENFORCED - tier FK match + DoD comment check + permission |
| 6 | REVIEWER reviews | HONOUR SYSTEM |
| 7 | REVIEWER approves → DISCIPLINE_LEAD activates | ENFORCED |
| 8 | DISCIPLINE_LEAD reviews | HONOUR SYSTEM |
| 9 | DISCIPLINE_LEAD approves → DEPT_CHIEF activates | ENFORCED |
| 10 | DEPT_CHIEF approves (final) → EDVs → APPROVED, session → APPROVED | ENFORCED |
| 11 | All comments VERIFIED or CLOSED before any tier approves | ENFORCED - `assertPackageApprovalAllowed` + `assertSessionCloseAllowed` |
| 12 | Package locked (all EDVs APPROVED → LOCKED) | ENFORCED - `assertPackageLockEligible` requires all APPROVED; only `chiefUserId` can lock |
| 13 | New design package created (if needed) | HONOUR SYSTEM - no constraint on creation |
| 14 | TaskDiscipline marked complete | HONOUR SYSTEM - no formal close action; implicit |
| 15 | Task marked COMPLETED after all disciplines locked | HONOUR SYSTEM - no discipline state check in `updateTask` |
| 16 | All tasks COMPLETED before project closes | HONOUR SYSTEM - no check in `updateProject` |
| 17 | Closeout checklist items completed | HONOUR SYSTEM - no enforcement connecting checklist to project status |
| 18 | Project status → COMPLETED | PARTIALLY ENFORCED - status transition guard (ACTIVE only); no business-entity readiness gate |
| 19 | Project status → CLOSED | PARTIALLY ENFORCED - status transition guard (COMPLETED only); no business-entity readiness gate |

---

## PART 6 - GAP ANALYSIS

### 6.1 - Missing Enforcement

#### Gap 1 - Five tiers not present in ReviewTier enum

| | |
|---|---|
| **Should happen** | Workflow enforces five governance tiers (Designer, Discipline Owner, Reviewer, Discipline Lead, Deputy Chief, Institute Chief) |
| **Actually happens** | Only four tiers exist in `ReviewTier` enum. There is no Deputy Chief or Institute Chief tier (schema.prisma:1217–1223; review-tier.enum.ts:1–13) |
| **Risk** | If the business requires institute-level sign-off, there is no tier for it and the workflow cannot enforce it |
| **Location** | schema.prisma:1217–1223; review-tier.enum.ts:1–13 |

#### Gap 2 - Layer 3 check is not tier-specific for BatchReturnEdvs

| | |
|---|---|
| **Should happen** | Only the current tier's assignee should be able to batch-return EDVs |
| **Actually happens** | `BatchReturnEdvs` (review-workflow.service.ts:984) calls only `permissionResolver.assertActionAllowed` (line 1012–1022) - no `assertActorMatchesReviewTier`. Layer 3 passes for any of the four discipline tier users regardless of session's current tier |
| **Risk** | DISCIPLINE_LEAD or DEPT_CHIEF can batch-return EDVs while session is at DISCIPLINE_OWNER tier |
| **Location** | review-workflow.service.ts:1012–1022; permission-context-builder.ts:187–201 |

#### Gap 3 - SLA is notification-only

| | |
|---|---|
| **Should happen** | SLA deadlines block workflow or auto-escalate tier |
| **Actually happens** | `escalateOverdueSessions` (review-sla.service.ts:92) marks `slaEscalatedAt` and sends a notification. Class comment: "visibility only, never blocks workflow" (review-sla.service.ts:33) |
| **Risk** | Reviewers can ignore SLA deadlines with no workflow consequence |
| **Location** | review-sla.service.ts:33 |

#### Gap 4 - Resubmission check weaker than "all comments resolved"

| | |
|---|---|
| **Should happen** | All comments must be resolved/verified before a package can be resubmitted |
| **Actually happens** | `submitPackageForReview` (review-workflow.service.ts:150–156) only blocks on `OPEN` or `IN_PROGRESS` comments. `ACKNOWLEDGED` and `RESOLVED` comments allow resubmission. Error message says "must be acknowledged" but ACKNOWLEDGED comments pass |
| **Risk** | Package can be resubmitted with unactioned comments |
| **Location** | review-workflow.service.ts:150–158 |

#### Gap D5 - No discipline-closure gate on task completion (confirmed from prior audit)

| | |
|---|---|
| **Should happen** | Task cannot be COMPLETED until all child TaskDisciplines have all packages LOCKED |
| **Actually happens** | `updateTask` (schedule.service.ts:342–398) has no discipline state query |
| **Risk** | Task can be marked COMPLETED while design work is still in progress |
| **Location** | schedule.service.ts:342–398 |

#### Gap 6 - No project readiness gate on COMPLETED / CLOSED

| | |
|---|---|
| **Should happen** | Project cannot close until tasks, disciplines, closeout, and punch items are all in final state |
| **Actually happens** | `updateProject` (projects.service.ts:216–230) only validates the status transition rule. No entity queries |
| **Risk** | Project can be set to CLOSED while open tasks, unresolved punch items, and incomplete closeout checklist items exist |
| **Location** | projects.service.ts:216–230 |

#### Gap 7 - Comment severity routing is informational only

| | |
|---|---|
| **Should happen** | A MAJOR comment automatically escalates the review session to a higher governance tier |
| **Actually happens** | `ReviewRoutingService.route()` result is written to `WorkflowEventLog` only (review-workflow.service.ts:362–370). No tier advancement, no session state change |
| **Risk** | MAJOR design defects do not trigger automatic escalation |
| **Location** | review-workflow.service.ts:362–370; review-routing.service.ts:24–64 |

#### Gap 8 - No `isCurrent` marker on EngineeringDocumentVersion

| | |
|---|---|
| **Should happen** | System explicitly identifies which EDV is the active revision |
| **Actually happens** | No `isCurrent` field on `EngineeringDocumentVersion` (schema.prisma:1493–1520). The generic `Document` model has `isCurrent` (line 781) but that is unrelated |
| **Risk** | Reporting and UI must infer current version from status/date; no explicit pointer; risk of ambiguity |
| **Location** | schema.prisma:1493–1520 |

#### Gap 9 - Reassignment does not validate tier FK match

| | |
|---|---|
| **Should happen** | New assignee in a reassignment should match the current tier's FK on the discipline |
| **Actually happens** | `reassignReviewSession` (workflow-kernel.service.ts:162–221) only checks admin role. Any active company user can be assigned regardless of discipline FK |
| **Risk** | Session can be reassigned to a user with no discipline FK, causing `assertActorMatchesReviewTier` to fail when they attempt to approve |
| **Location** | workflow-kernel.service.ts:162–221 |

---

### 6.2 - Missing Connections

#### Disconnection 1 - Task status ↔ TaskDiscipline state

| | |
|---|---|
| **What should connect** | Task COMPLETED should require all child TaskDisciplines to have all packages LOCKED |
| **What would happen if connected** | Task cannot be falsely marked done while design work remains in progress |
| **Partial connection** | `TaskDiscipline.taskId` FK exists (schema.prisma:1419) but `updateTask` never reads discipline state |

#### Disconnection 2 - Project status ↔ Closeout status

| | |
|---|---|
| **What should connect** | `Project.CLOSED` should require `Closeout.status = ARCHIVE` and all `CloseoutChecklistItem.isComplete = true` |
| **What would happen if connected** | Project cannot close with unfinished closeout |
| **Partial connection** | `Closeout.projectId @unique` FK exists (schema.prisma:2342); `Project.closeout` relation exists (line 1307); `updateProject` never reads from `Closeout` |

#### Disconnection 3 - Project status ↔ Task / Milestone completion

| | |
|---|---|
| **What should connect** | `Project.COMPLETED` should require all tasks in COMPLETED status (or milestones ACHIEVED) |
| **What would happen if connected** | Project cannot close while tasks are DELAYED or IN_PROGRESS |
| **Partial connection** | `Task.projectId` FK exists; `updateProject` never queries Task status |

#### Disconnection 4 - Comment severity routing ↔ tier advancement

| | |
|---|---|
| **What should connect** | MAJOR comment should trigger session to advance to the appropriate governance tier |
| **What would happen if connected** | MAJOR defects would automatically engage senior reviewers |
| **Partial connection** | `ReviewRoutingService.route()` computes `escalate=true` and `nextTier`, but these are metadata stored in WorkflowEventLog only (review-workflow.service.ts:362–370) |

#### Disconnection 5 - DesignPackage locked state ↔ DesignPackageProjectedStatus

| | |
|---|---|
| **What should connect** | A fully locked package should reflect a `LOCKED` projected status |
| **What would happen if connected** | System could clearly surface that a package is done forever |
| **Partial connection** | `DesignPackageProjectedStatus` enum (schema.prisma:1127–1133) has no `LOCKED` value. Packages can be locked (all EDVs LOCKED) but there is no corresponding projected status |

---

### 6.3 - Status Machine Completeness

| Entity | Enforcement level | Evidence (file:line) |
|--------|-----------------|---------------------|
| `EngineeringDocumentVersion` | **FULLY ENFORCED** | edv-state-machine.ts:17–34 (explicit transition table); LOCKED and SUPERSEDED terminal at lines 36–38; `transitionEdvStatus` throws on invalid (line 94–103) |
| `ReviewSession` | **FULLY ENFORCED** | Status changes only through service methods with guards; APPROVED and RETURNED_FOR_REWORK only set at defined points in review-workflow.service.ts |
| `DesignPackage` (`projectedStatus`) | **PARTIALLY ENFORCED** | Computed by StateProjectionService (file not provided); `projectionPending` flag controls recompute (schema.prisma:1528); StateProjection source not available for full assessment |
| `TaskDisciplineReview` | **FULLY ENFORCED** | Only written via `upsertTaskDisciplineReviewInTx` (review-workflow.service.ts:1195); never written directly in controllers |
| `Task` | **PARTIALLY ENFORCED** | `TASK_STATUS_TRANSITIONS` guard in `updateTask` (schedule.service.ts:348–362); no business-rule gates (discipline state, child task completion) |
| `Milestone` | **PARTIALLY ENFORCED** | `MILESTONE_STATUS_TRANSITIONS` guard in `updateMilestone` (schedule.service.ts:170–178); no business-rule gates |
| `Project` | **PARTIALLY ENFORCED** | `PROJECT_STATUS_TRANSITIONS` guard in `updateProject` (projects.service.ts:217–230); CLOSED is terminal but reachable with no entity readiness checks |
| `ReviewComment` | **FULLY ENFORCED** | comment-state-machine.ts:69–125 (transition + actor validation); `TERMINAL_COMMENT_STATUSES` enforces CLOSED as terminal; actor role required per transition |
| `Closeout` | **FREE SET** | No state machine found in any provided file. Only a raw `status: CloseoutStatus` field (schema.prisma:2345) with CRUD update access. No transition guard service found |

---

## SUMMARY - WHAT IS ENFORCED VS HONOUR SYSTEM

| Flow step | Enforced by code? | If not enforced - what is the risk? |
|-----------|------------------|-------------------------------------|
| Designer uploads EDV | ENFORCED | - |
| Package submitted for review | ENFORCED | - |
| Tier 1 (DISCIPLINE_OWNER) reviews | HONOUR SYSTEM | Reviewer can sit on package indefinitely with no consequence |
| Tier 1 approves → Tier 2 (REVIEWER) activates | ENFORCED | - |
| Tier 2 (REVIEWER) reviews | HONOUR SYSTEM | Same as above |
| Tier 2 approves → Tier 3 (DISCIPLINE_LEAD) activates | ENFORCED | - |
| Tier 3 (DISCIPLINE_LEAD) reviews | HONOUR SYSTEM | - |
| Tier 3 approves → Tier 4 (DEPT_CHIEF) activates | ENFORCED | - |
| Tier 4 (DEPT_CHIEF) approves (final) | ENFORCED | - |
| All comments resolved before approval | ENFORCED (must be VERIFIED or CLOSED; RESOLVED blocks) | - |
| Package locked after final approval | ENFORCED (all EDVs must be APPROVED; only chiefUserId can lock) | - |
| New design package created | HONOUR SYSTEM | New package can be created with no constraint |
| TaskDiscipline marked complete | HONOUR SYSTEM | Implicit only; no formal close action |
| Task marked complete after all disciplines done | HONOUR SYSTEM | Task can be COMPLETED while design work is in progress |
| All tasks complete before project closes | HONOUR SYSTEM | Project can close with DELAYED / IN_PROGRESS tasks |
| Closeout checklist complete before project closes | HONOUR SYSTEM | Project can close with incomplete checklist |
| Project status → COMPLETED | PARTIALLY ENFORCED (transition rule only; no entity gate) | Premature closure with live work streams |
| Project status → CLOSED | PARTIALLY ENFORCED (transition rule only; no entity gate) | Premature archival with outstanding obligations |

---

*End of audit. All findings cite the exact file and line number in the codebase. No code changes were made.*
