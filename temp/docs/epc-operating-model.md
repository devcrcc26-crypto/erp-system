# EPC Operating Model

## Domain boundaries

- **Layer 1 - File (Core Foundation):** `Document`, `DocumentVersion`, `DocumentFolder` - storage + versioning only; no engineering workflow state
- **Layer 2 - Engineering (PM register):** `EngineeringDocument`, `EngineeringDocumentVersion`, `DesignPackage`, `DesignPackageItem`, `DesignPackageDependency`, `TaskDiscipline` - meaning, discipline ownership, package grouping
- **Layer 3 - Workflow (PM orchestration):** `ReviewSession`, `ReviewComment`, `ReviewContextSnapshot`, `Submittal`, `WorkflowEventLog`, `RFI`, `Issue`, `ChangeRequest` - approvals, loops, external boundary
- **Writable lifecycle authority:** `EngineeringDocumentVersion.status` only - via `WorkflowKernel` / write gate
- **Derived aggregates (never direct write):** `DesignPackage.projectedStatus`, `TaskDiscipline.projectedStatus` - Phase B projection only
- **Ephemeral session state:** `ReviewSession`, `ReviewComment` - not authoritative for EDV lifecycle
- **External boundary:** `Submittal`, `SubmittalReview`, client-recorded responses - trigger-only; never mutates internal EDV status

## Work structure

- `TaskDiscipline` → `DesignPackage` → `EngineeringDocumentVersion` → Review → Submittal
- One workflow lifecycle for all `EngineeringDocumentType` values - type affects metadata only

## Role layers

- **Production:** Designer, **Discipline Owner**, Reviewer, Discipline Lead - create, check, discipline sign-off
- **Control:** Department Chief Engineer - governance, risk acceptance, lock authorization
- **Execution:** Project Manager, Dispatcher, Planning Engineer, Site Coordinator, Client Consultant - WBS, assignment, milestones, site/consultant RFIs
- **Logistics:** Document Controller, Deputy Chief Engineer - file hygiene, submittal packaging

## Review tier chain

`DISCIPLINE_OWNER → REVIEWER → DISCIPLINE_LEAD → DEPT_CHIEF`

Review sessions open at **Discipline Owner**. Institute Chief is removed from the internal chain; dept chief is the final governance tier before submittal lock.

## Discipline scoping

Users assigned on a `TaskDiscipline` (designer, owner, reviewer, lead, or chief) see only their disciplines unless they hold **Project Manager**, **Managing Director**, or **System Administrator** bypass roles.

## Information flow

- **Forward:** Designer → Discipline Owner → Reviewer → Discipline Lead → Chief → Submittal → Client/Authority
- **Feedback:** Chief → Designer (controlled revision only); Client/Authority → RFI/CR → revision-orchestrator → internal loop
- **Forbidden:** Chief direct file edit (comment/markup only); external actor mutating internal EDV status; submittal referencing non-LOCKED EDVs

## Definition of Done (gates)

- **Designer:** package EDVs uploaded + registered; submitted for review; no open assigned comments
- **Reviewer:** comments recorded; resolutions VERIFIED; no open MAJOR; session approved or rework
- **Discipline Lead:** cross-drawing consistency; package `APPROVED`; all EDVs `APPROVED`
- **Dept Chief:** governance comments VERIFIED; all package EDVs `LOCKED`
- **Submittal:** packages locked; issued; external response recorded
- **TaskDiscipline:** all packages `APPROVED`; all EDVs `LOCKED` or waived

## Operating units

| Unit | Owns | Outcome |
|------|------|---------|
| TaskDiscipline | Execution | Engineering work completed + internally approved |
| Review chain | Quality control | Technical truth validated tier-by-tier |
| Submittal | Delivery | Locked package leaves the company |
| PMO | Time/resource | Work driven, assigned, tracked |
| Chief Engineers | Governance | Risk accepted; package authorized |
