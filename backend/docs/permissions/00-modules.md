# System Module Inventory

Every functional module in the ERP system. Backend path is relative to `backend/src/modules/`; frontend path is relative to `frontend/app/(dashboard)/` unless noted.

---

## Core / Infrastructure

| Module | Backend path | Frontend path | Purpose | Main entities |
|---|---|---|---|---|
| Authentication | `auth` | `(auth)/login`, `(auth)/forgot-password`, `(auth)/reset-password`, `(auth)/activate`, `(auth)/confirm-email-change`, `(shell)/change-password` | JWT login, password reset, email verification, account activation | `User`, `UserSession`, `PasswordResetToken`, `EmailVerificationToken` |
| User Management | `user-management` | `users` | User CRUD, role assignment, permission scoping, bulk import | `User`, `Role`, `UserRole`, `Permission`, `RolePermission`, `DataScope`, `InactivePeriod`, `EmploymentPeriod` |
| Company Setup / Org Structure | `company-setup` | `departments`, `positions`, `disciplines`, `seniority-levels`, `organization` | Company entity, org hierarchy (branches, divisions, departments, cost centres), financial years, number series | `Company`, `CompanySetting`, `Branch`, `Division`, `Department`, `Discipline`, `Position`, `SeniorityLevel`, `CostCentre`, `FinancialYear`, `FinancialPeriod`, `NumberSeries` |
| Notifications | `notifications` | `notifications` | In-app, email, and SMS delivery and preference management | `Notification`, `NotificationTemplate`, `NotificationPreference` |
| Audit Logs | `audit` | `audit-logs` | Immutable audit trail for all user and system actions | `AuditLog` |
| Documents | `documents` | `projects/[projectId]/documents` (and contextual) | Hierarchical folder/file storage with versioning and access control | `DocumentFolder`, `Document`, `DocumentVersion`, `DocumentAccess` |
| Reporting / Dashboard | `reporting` | `reports`, `hr/reports` | Configurable report definitions, scheduled reports, HR analytics, dashboard widgets | `ReportDefinition`, `ReportSchedule`, `DashboardWidget` |
| Policy Settings | `policy-settings` | `hr/policy-settings` | System-wide HR policy configuration (backdating rules, overrides) | `PolicySetting` |
| On-Behalf Delegation | `on-behalf` | (used inside HR module pages) | Allows supervisors and delegates to submit HR requests on behalf of employees | `RequestInitiatorType` (enum); no dedicated table — references `User` |
| Approvals | `approvals` | `approvals` | Multi-tier configurable approval workflows for all request types | `ApprovalCategory`, `ApprovalRequest`, `ApprovalTier`, `ApprovalComment`, `ApprovalResponse`, `ApprovalResponseDocument` |

---

## HR Operations

| Module | Backend path | Frontend path | Purpose | Main entities |
|---|---|---|---|---|
| Work Schedule | `work-schedule` | `hr/work-schedules`, `hr/public-holidays`, `hr/work-from-home` | Schedule templates, day patterns, employee schedule assignments, public holidays, WFH days | `WorkSchedule`, `WorkScheduleDay`, `EmployeeScheduleAssignment`, `PublicHoliday`, `WorkFromHomeDay` |
| Attendance | `attendance` | `hr/attendance` | Time-in/time-out records, daily log reconciliation, monthly approvals, device identity mapping, bulk import | `AttendanceRecord`, `AttendanceDailyLog`, `AttendanceDailyLogCorrection`, `AttendanceMonthlyApproval`, `AttendanceIdentity`, `AttendanceImportBatch`, `AttendanceImportUnmatched`, `AttendanceImportMissing`, `FieldMovementLog`, `FieldMovementEntry` |
| HR Shared (Utilities) | `hr-shared` | (shared service layer, no dedicated page) | Backdating policy enforcement, working-day coverage calculations | `InactivePeriod`, `EmploymentPeriod` (support models on `User`) |
| Site Assignment | `site-assignment` | `hr/site-assignments` | Employee site/project location assignment requests with approval workflow | `SiteAssignment` |
| Leave | `leave` | `hr/leave-requests`, `hr/leave-history` | Leave request submission, approval, balance tracking, bulk import | `LeaveRequest`, `LeaveRequestPeriod`, `LeaveRequestDocument`, `LeaveBalance`, `LeaveBalanceEntry` |
| Leave Policy | `leave-policy` | `hr/leave-policy` | Leave type rules: accrual, carry-forward, eligibility per employee type | `LeavePolicy`, `LeavePolicyRule` |
| Overtime | `overtime` | `hr/overtime`, `hr/overtime-history` | Overtime sheet submission, entry-level tracking, and approval | `OvertimeSheet`, `OvertimeEntry`, `OvertimeEntryDocument` |
| Payroll | `payroll` | `hr/payroll` | Monthly payroll run processing: salary, tax, pension, bonus, payslip generation | `PayrollRun`, `PayrollEntry`, `PayrollPayslip` |
| Employee Contract | `employee-contract` | `hr/employee-contract` | Contract lifecycle: creation, amendments, termination, bulk import | `EmployeeContract` |
| Evaluation | `evaluation` | `hr/employee-evaluation`, `evaluations` | Performance evaluation: template design, cycle management, scoring, disputes | `EvaluationTemplate`, `EvaluationSection`, `EvaluationCriteria`, `EvaluationCycle`, `EmployeeEvaluation`, `EvaluationAssessment`, `EvaluationScore`, `EvaluationDispute` |
| Company Asset | `company-asset` | `hr/company-asset` | Asset registry and employee asset assignment/return tracking | `CompanyAsset`, `AssetAssignment` |
| Announcements | `announcements` | `announcements`, `hr/announcements` | Company-wide and targeted announcement creation and distribution | `Announcement`, `AnnouncementRecipient` |
| Org Gaps | (handled by `company-setup` / `user-management` services) | `hr/org-gaps` | Visual analysis of unfilled positions in the org hierarchy | `User`, `Department`, `Position` |

---

## Travel & Expense

| Module | Backend path | Frontend path | Purpose | Main entities |
|---|---|---|---|---|
| Flight Applications | `flight` | `hr/flight-applications` | Employee flight booking request submission and approval | `FlightApplication`, `FlightPassenger`, `FlightApplicationDocument` |
| Business Trip | `business-trip` | `hr/business-trips` | Business travel requests covering transport, accommodation, and itinerary | `BusinessTrip`, `BusinessTripPassenger`, `BusinessTripDocument` |
| Expense Claim | `expense-claim` | `hr/expense-claims` | Employee expense reimbursement claims with multi-currency support | `ExpenseClaim`, `ExpenseClaimItem`, `ExchangeRate` |
| Per Diem | `per-diem` | `hr/per-diem`, `hr/per-diem-rates`, `hr/employee-per-diem-rates` | Per diem allowance requests, settlement, and rate configuration per employee | `PerDiemRequest`, `PerDiemSettlement`, `EmployeePerDiemRate` |
| Exit Permit | `exit-permit` | `hr/equipment-and-materials-exit-permit` | Equipment and materials exit permit requests for taking items off-site | `ExitPermit`, `ExitPermitItem` |

---

## Procurement

| Module | Backend path | Frontend path | Purpose | Main entities |
|---|---|---|---|---|
| Purchase Request | `purchase-request` | `hr/purchase-requests` | Internal purchase request workflow for goods and services | `PurchaseRequest`, `PurchaseRequestItem` |
| Material Requisition | `material-requisition` | `hr/material-requisition` | Material requisition requests for project construction materials | `MaterialRequisition`, `MaterialRequisitionItem` |
| Consumables Requisition | `consumables-requisition` | `hr/consumables` | Consumable items (office/site supplies) requisition workflow | `ConsumablesRequisition`, `ConsumablesRequisitionItem` |

---

## Fleet & Vehicles

| Module | Backend path | Frontend path | Purpose | Main entities |
|---|---|---|---|---|
| Company Vehicle | `company-vehicle` | `organization/vehicles` | Fleet registry: vehicle specs, registration, status management | `CompanyVehicle` |
| Vehicle Application | `vehicle-application` | `hr/vehicle-applications` | Employee vehicle usage/dispatch request and approval | `VehicleApplication` |
| Vehicle Refueling | `vehicle-refueling` | `hr/vehicle-refueling` | Fuel consumption logging per vehicle with cost tracking | `VehicleRefueling` |
| Inspection & Repair | `inspection-repair` | `hr/inspection-repair` | Vehicle and equipment inspection reports and repair orders | `InspectionRepair` |

---

## Seal / Stamp

| Module | Backend path | Frontend path | Purpose | Main entities |
|---|---|---|---|---|
| Official Seal | `official-seal` | `hr/official-seal` | Official company seal usage requests for documents requiring the company stamp | `OfficialSeal` |
| Project Seal | `project-seal` | `hr/project-seal` | Project-level seal usage requests for project-stamped documents | `ProjectSeal` |

---

## Project Management

All share backend module `backend/src/modules/project-management/presentation/controllers/`.

| Module | Controller | Frontend path | Purpose | Main entities |
|---|---|---|---|---|
| Projects (Core) | `projects.controller.ts` | `projects`, `projects/[projectId]/overview`, `projects/[projectId]/team` | Project lifecycle: creation, teams, milestones, tasks, kanban, schedule | `Project`, `ProjectTeam`, `Milestone`, `Task`, `TaskDiscipline`, `TaskDependency` |
| Change Requests | `change-requests.controller.ts`, `my-change-requests.controller.ts` | `change-requests`, `projects/[projectId]/change-requests` | Project change request tracking, costing, and approval | `ProjectChangeRequest` |
| RFIs | `rfis.controller.ts`, `my-rfis.controller.ts` | `rfis`, `projects/[projectId]/rfis` | Requests for information with formal response tracking | `Rfi`, `RfiResponse` |
| Submittals | `submittals.controller.ts` | `submittals`, `projects/[projectId]/submittals` | Document submittal review with internal and external approval routing | `Submittal`, `SubmittalItem`, `SubmittalReview`, `SubmittalSiteReview`, `SubmittalExternalApproval`, `SubmittalExternalFeedback`, `ExternalReviewTrigger` |
| Issues | `issues.controller.ts`, `my-issues.controller.ts` | `issues`, `projects/[projectId]/issues` | Issue identification, assignment, and resolution tracking | `Issue`, `IssueResponse` |
| Risks | `risks.controller.ts`, `my-risks.controller.ts` | `risks`, `projects/[projectId]/risks` | Risk register with mitigation actions and periodic reviews | `Risk`, `RiskMitigation`, `RiskReview` |
| Correspondence | `correspondence.controller.ts`, `correspondence-global.controller.ts` | `correspondence`, `projects/[projectId]/correspondence` | Formal project correspondence and letter management | `Correspondence` |
| Daily Logs | `daily-logs.controller.ts`, `my-daily-logs.controller.ts` | `daily-logs`, `projects/[projectId]/daily-logs` | Site daily progress logs: workforce, equipment, visitors, incidents, materials | `DailyLog`, `DailyLogWorkforce`, `DailyLogEquipment`, `DailyLogVisitor`, `DailyLogIncident`, `DailyLogMaterial` |
| Meetings | `meetings.controller.ts`, `my-meetings.controller.ts` | `meetings`, `projects/[projectId]/meetings` | Meeting minutes with agenda items, attendees, and action items | `Meeting`, `MeetingAgendaItem`, `MeetingAttendee`, `ActionItem` |
| Punch List | `punch-items.controller.ts`, `punch-items-global.controller.ts` | `punch-list`, `projects/[projectId]/punch-list` | Construction punch list item creation, assignment, and sign-off | `PunchItem` |
| Closeout | `closeout.controller.ts` | `projects/[projectId]/closeout` | Project closeout checklist and warranty record management | `Closeout`, `CloseoutChecklistItem`, `Warranty` |
| Design Packages | `design-packages.controller.ts` | `design-packages`, `projects/[projectId]/engineering-documents` | Engineering design package creation, item tracking, dependency management, review | `DesignPackage`, `DesignPackageItem`, `DesignPackageDependency`, `DesignPackageAttachment` |
| Drawings | `drawings.controller.ts` | `projects/[projectId]/drawings` | Engineering drawing registration, version control, inter-drawing links | `Drawing`, `DrawingVersion`, `DrawingLink` |
| Deliverables | `deliverables.controller.ts` | `projects/[projectId]/deliverables` | Deliverable tracking against milestones and disciplines | `Deliverable` |
| Engineering Documents | `engineering-documents.controller.ts`, `engineering-batch.controller.ts` | `projects/[projectId]/engineering-documents` | Engineering document repository with version control and workflow state | `EngineeringDocument`, `EngineeringDocumentVersion` |
| Review Sessions / Inbox | `review-batch.controller.ts`, `review-comments.controller.ts` | `review-inbox`, `projects/[projectId]/review-inbox` | Document review sessions with contextual commenting and SLA tracking | `ReviewSession`, `ReviewContextSnapshot`, `ReviewComment`, `ReviewCommentDocument`, `ReviewCommentFile`, `WorkflowEventLog` |
| External Releases | `external-releases.controller.ts` | `external-releases`, `projects/[projectId]/external-releases` | Controlled external release of project documents to clients/authorities | `ExternalReviewTrigger` |
| Project Schedule | `schedule.controller.ts` | `projects/[projectId]/schedule` | Gantt schedule management with task dependencies and milestone alignment | `Task`, `TaskDependency`, `Milestone` |
| EPC Workspace | `epc-workspace.controller.ts` | `projects` (workspace view) | EPC consolidated project workspace | `Project`, `TaskDiscipline`, `EngineeringDocument`, `DesignPackage` |

---

## Frontend-Only / Portal (no dedicated backend module)

| Module | Frontend path | Purpose | Entities (aggregated from other modules) |
|---|---|---|---|
| Profile | `profile` | User self-service profile view and edit | `User` |
| Messages | `messages` | Internal messaging between users | `Notification` (in-app channel) |
| My Work | `my-work`, `projects/[projectId]/my-work` | Personal work-item dashboard: tasks, action items, reviews | `Task`, `ActionItem`, `ReviewComment` |
| My Comments | `my-comments`, `projects/[projectId]/my-comments` | Cross-project view of review comments authored by the user | `ReviewComment` |
| Kanban Board | `kanban-board` | Portfolio-level kanban view across all projects | `Project`, `Task` |
| Team Directory | `team`, `teams` | Company and project team member directory | `User`, `ProjectTeam` |
| What's New | `whats-new` | System changelog / release notes | (static content) |
| Change Password | `(shell)/change-password` | Authenticated password change form | `User` |

---

## Summary counts

| Scope | Count |
|---|---|
| Backend modules (`backend/src/modules/`) | 38 |
| Frontend dashboard top-level pages | 36 |
| HR sub-pages (`hr/`) | 34 |
| Project sub-pages (`projects/[projectId]/`) | 22 |
| Auth pages | 5 |
| Distinct Prisma models | ~130 |
