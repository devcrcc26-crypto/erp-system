# Engineering Document Metadata

This document describes metadata fields and workflow semantics for **Engineering Documents (ED)** and **Engineering Document Versions (EDV)** in the EPC design workflow.

## Engineering Document (ED)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Stable document identity across revisions |
| `companyId` | UUID | Tenant isolation - always from JWT |
| `taskDisciplineId` | UUID | Owning discipline within project schedule |
| `documentNumber` | string | Company-scoped number from `NUMBER_SERIES` |
| `title` | string | Human-readable title |
| `documentType` | enum | Drawing, calculation, specification, etc. |
| `currentVersionId` | UUID? | Pointer to latest EDV row |

ED rows are **not** the lifecycle authority. Status lives on EDV only.

## Engineering Document Version (EDV)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Version identity |
| `engineeringDocumentId` | UUID | Parent ED |
| `revisionLabel` | string | e.g. `A`, `B`, `C` |
| `status` | `EdvStatus` | **Sole writable lifecycle field** |
| `lockedAt` | timestamp? | Set when entering `LOCKED` |
| `issuedAt` | timestamp? | Set when entering `ISSUED` |

### EDV status machine

```
DRAFT → IN_REVIEW → APPROVED → LOCKED → ISSUED
         ↓              ↓
      RETURNED      (internal loop)
```

- Transitions go through `WorkflowKernel` / `EdvTransitionService` only.
- `LOCKED` versions are immutable; external revision creates a new `DRAFT` EDV.

## Workflow event phases

| Phase | When written | Purpose |
|-------|----------------|---------|
| `INTENT` | Inside Phase A+B transaction | Records intended state change |
| `COMMITTED` | Post-commit (BullMQ or sync) | Confirms successful persistence - prevents ghost approvals |
| `CORRECTION` | Admin correction API | Append-only audit fix referencing prior event |

`correlationId` ties INTENT and COMMITTED rows for one command.

## Review session metadata

| Field | Description |
|-------|-------------|
| `currentTier` | `REVIEWER` → `DISCIPLINE_LEAD` → `DEPT_CHIEF` → `INSTITUTE_CHIEF` |
| `slaDeadlineAt` | Tier-based deadline (non-blocking) |
| `contextSnapshot` | Frozen EDV ids + content hash at session open |

## Comment metadata

| Field | Description |
|-------|-------------|
| `severity` | `MINOR` / `MODERATE` / `MAJOR` - drives `ReviewRoutingService` |
| `status` | Designer resolution state (`OPEN` → `RESOLVED`) |
| `assignedToUserId` | Designer responsible for closure |

## Design package projections

`DesignPackage.projectedStatus` and `TaskDiscipline.projectedStatus` are **read models** derived from EDV states. Nightly reconciliation (`ProjectionReconciliationCron`) corrects drift.

## Submittal boundary

External submittal review outcomes create `ExternalReviewTrigger` rows and optional `ProjectChangeRequest` drafts. They **never** mutate EDV status directly; `RevisionOrchestrator` processes triggers in a separate loop.

## API read models

| Endpoint | Purpose |
|----------|---------|
| `GET /review-inbox` | Assignee queue with SLA flags |
| `GET /my-comments` | Designer comment queue |
| `GET /projects/:id/status-board` | Package/discipline KPIs |
| `GET /projects/:id/workload` | Dispatcher bottleneck view |
| `GET /design-packages/:id/review-mode` | Active session + snapshot |
| `GET /engineering-documents/:id/version-history` | Per-EDV event timeline |
| `GET /projects/:id/engineering-documents/:id/decision-trace` | Approval lineage |

## Permissions

EPC roles (`Reviewer`, `Discipline Lead`, `Department Chief`, etc.) receive scoped `schedule` module flags via `epcWorkflowPermissionFlags()` in seed. Project-scoped actions additionally pass `PermissionResolverService` checks.
