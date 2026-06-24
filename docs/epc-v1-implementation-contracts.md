# EPC v1 Implementation Contracts

Wave 0 gate - no Wave 1 migration until signed off.

## WorkflowKernel

- **Single entry:** `WorkflowKernel.execute(command: WorkflowCommand): Promise<WorkflowResultSnapshot>`
- **Controllers / task-workflow:** call kernel only - never Prisma for status writes
- **Two-phase transaction (single `$transaction`):**
  - **Phase A - Write intent:** permission check, conflict-guard, EDV transition, `INTENT` event append, `projectionPending = true`
  - **Phase B - Projection hook:** `PackageStatusResolver`, `DisciplineStatusResolver`, clear `projectionPending`
  - **Post-commit async:** `COMMITTED` event, notifications, SLA, cache
- **API returns:** post-Phase-B state only
- **Batch ops (v1):** one kernel invocation per package unit; all-or-nothing per transaction

## Event model

| Phase | When | Rollback |
|-------|------|----------|
| `INTENT` | Inside `$transaction` with EDV write | Disappears on tx rollback |
| `COMMITTED` | Post-commit (BullMQ) | Never written if commit failed |
| `CORRECTION` | Append-only fix | References `correctsEventId`; never update/delete log rows |

- Every EDV transition, comment assign, package submit, lock, submittal issue, escalation emits via event log
- Idempotency: optional `Idempotency-Key` → `correlationId`; replay returns same result

## Permission model

- **Algorithm:** `canPerform(user, action, context)` - deny wins; default-deny; assignee override for tier actions
- **Layers (order, short-circuit on deny):**
  1. System role - `RolePermission` action flags
  2. Project team role - `ProjectTeam.roleOnProject`
  3. Discipline assignment - `TaskDiscipline.{designer,reviewer,lead,chief}UserId`
  4. Project design phase - `ProjectDesignPhase` gates
  5. Workflow state - e.g. cannot `lock` unless EDV `APPROVED`
- **Cache:** per-request only (v1)

## Version identity

- **Primary FK:** `EngineeringDocumentVersion.id` (UUID) - immutable
- **Display only:** `revisionLabel` - never FK
- **Linear lockstep (v1):** one active `DRAFT` per `EngineeringDocument`; no revision label reuse
- **Rollback:** no delete - `SUPERSEDED` or `CORRECTION` event

## Package dependency

- `DesignPackageDependency`: `FINISH_TO_START` (hard gate) | `COORDINATION_ONLY` (snapshot only)
- On `SubmitPackageForReview`: assert FINISH_TO_START deps LOCKED; freeze `ReviewContextSnapshot.referencedVersionIds` (EDV UUIDs)
- Cycle detection on create/update (Wave 6 enforcement; spec in Wave 1 schema)

## Conflict rules (v1)

- Approve blocked if any comment `NOT IN (VERIFIED, CLOSED)` on package EDVs
- New EDV upload blocked during active `ReviewSession` on same document
- Comments forbidden on `LOCKED` EDV (409)
- Batch approve: all-or-nothing transaction

## Wave 0.5 domain modules (next)

- `edv-state-machine.ts`
- `package-status-resolver.ts`
- `discipline-status-resolver.ts`
- `comment-state-machine.ts`
- `permission-context-builder.ts`

## Pre-V1 gate checklist

- [x] `docs/epc-operating-model.md`
- [x] `docs/epc-v1-implementation-contracts.md`
- [x] `WorkflowKernel` interface + command types
- [x] Two-phase + INTENT/COMMITTED/CORRECTION model agreed
- [x] `permission-resolver` deny-wins unit tests
- [ ] Wave 0.5 pure domain modules unit-tested
- [ ] `DesignPackageDependency` + cycle detection spec reviewed (Wave 1 schema)
