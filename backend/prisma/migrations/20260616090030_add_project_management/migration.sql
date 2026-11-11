-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'INFRASTRUCTURE', 'INDUSTRIAL');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'TENDER', 'MOBILIZATION', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DELAYED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TaskDependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateEnum
CREATE TYPE "RfiPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "RfiStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubmittalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'APPROVED_WITH_COMMENTS', 'REVISE_AND_RESUBMIT', 'REJECTED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PunchItemSeverity" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PunchItemStatus" AS ENUM ('RAISED', 'ASSIGNED', 'CORRECTED', 'VERIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RiskCategory" AS ENUM ('COST', 'SCHEDULE', 'SAFETY', 'QUALITY', 'ENVIRONMENTAL', 'CONTRACTUAL');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'MONITORING', 'MITIGATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CorrespondenceType" AS ENUM ('LETTER', 'EMAIL', 'NOTICE', 'INSTRUCTION', 'MEMO');

-- CreateEnum
CREATE TYPE "CorrespondenceStatus" AS ENUM ('DRAFT', 'SENT', 'ACKNOWLEDGED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('PROGRESS', 'DESIGN_COORDINATION', 'SAFETY', 'CLIENT');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'CONDUCTED', 'MINUTES_ISSUED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CloseoutStatus" AS ENUM ('PRACTICAL_COMPLETION', 'DEFECTS_LIABILITY_PERIOD', 'FINAL_COMPLETION', 'FINANCIAL_CLOSEOUT', 'ARCHIVE');

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "client_company_id" TEXT,
    "branch_id" TEXT,
    "project_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "project_type" "ProjectType",
    "contract_type" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "start_date" DATE,
    "planned_finish_date" DATE,
    "actual_finish_date" DATE,
    "budget" DECIMAL(18,2),
    "currency" TEXT,
    "project_manager_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_team" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_on_project" TEXT NOT NULL,
    "assigned_from" DATE,
    "assigned_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "project_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planned_date" DATE,
    "actual_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "milestone_id" TEXT,
    "parent_task_id" TEXT,
    "assigned_to" TEXT,
    "task_id_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" DATE,
    "finish_date" DATE,
    "duration_days" INTEGER,
    "progress_pct" INTEGER NOT NULL DEFAULT 0,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "is_critical" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependency" (
    "id" TEXT NOT NULL,
    "predecessor_task_id" TEXT NOT NULL,
    "successor_task_id" TEXT NOT NULL,
    "dependency_type" "TaskDependencyType" NOT NULL,
    "lag_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "task_dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfi" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "raised_by" TEXT NOT NULL,
    "assigned_to" TEXT,
    "rfi_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discipline" TEXT,
    "priority" "RfiPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "RfiStatus" NOT NULL DEFAULT 'DRAFT',
    "date_raised" DATE,
    "due_date" DATE,
    "date_answered" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "rfi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfi_response" (
    "id" TEXT NOT NULL,
    "rfi_id" TEXT NOT NULL,
    "responded_by" TEXT NOT NULL,
    "response_text" TEXT NOT NULL,
    "responded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfi_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submittal" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "submitted_by" TEXT NOT NULL,
    "reviewed_by" TEXT,
    "submittal_number" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contractor" TEXT,
    "supplier" TEXT,
    "spec_reference" TEXT,
    "revision_number" INTEGER NOT NULL DEFAULT 1,
    "status" "SubmittalStatus" NOT NULL DEFAULT 'DRAFT',
    "submission_date" DATE,
    "due_date" DATE,
    "review_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "submittal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submittal_review" (
    "id" TEXT NOT NULL,
    "submittal_id" TEXT NOT NULL,
    "reviewed_by" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "status" "SubmittalStatus" NOT NULL,
    "comments" TEXT,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submittal_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "folder_id" TEXT,
    "drawing_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discipline" TEXT,
    "revision" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CURRENT',
    "is_latest" BOOLEAN NOT NULL DEFAULT true,
    "date_issued" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "drawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing_version" (
    "id" TEXT NOT NULL,
    "drawing_id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CURRENT',
    "change_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawing_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing_link" (
    "id" TEXT NOT NULL,
    "drawing_id" TEXT NOT NULL,
    "linked_entity_type" TEXT NOT NULL,
    "linked_entity_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "drawing_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "site_engineer_id" TEXT NOT NULL,
    "log_date" DATE NOT NULL,
    "shift" TEXT,
    "weather_condition" TEXT,
    "temperature_c" DECIMAL(6,2),
    "rainfall_mm" DECIMAL(8,2),
    "work_summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "daily_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_workforce" (
    "id" TEXT NOT NULL,
    "daily_log_id" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "contractor" TEXT,
    "worker_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "daily_log_workforce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_equipment" (
    "id" TEXT NOT NULL,
    "daily_log_id" TEXT NOT NULL,
    "equipment_type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "hours_used" DECIMAL(8,2),
    "hours_downtime" DECIMAL(8,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "daily_log_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_visitor" (
    "id" TEXT NOT NULL,
    "daily_log_id" TEXT NOT NULL,
    "visitor_name" TEXT NOT NULL,
    "company" TEXT,
    "purpose" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "daily_log_visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_incident" (
    "id" TEXT NOT NULL,
    "daily_log_id" TEXT NOT NULL,
    "incident_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "daily_log_incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "organizer_id" TEXT NOT NULL,
    "meeting_number" TEXT NOT NULL,
    "meeting_type" "MeetingType" NOT NULL,
    "title" TEXT NOT NULL,
    "meeting_date" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "minutes_issued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_agenda_item" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "presenter_id" TEXT,
    "item_order" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "discussion_notes" TEXT,
    "decisions_made" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "meeting_agenda_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendee" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "user_id" TEXT,
    "external_name" TEXT,
    "organization" TEXT,
    "role_at_meeting" TEXT,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "meeting_attendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_item" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "due_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "action_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correspondence" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sender_user_id" TEXT,
    "reference_number" TEXT NOT NULL,
    "correspondence_type" "CorrespondenceType" NOT NULL,
    "subject" TEXT NOT NULL,
    "sender_name" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "correspondence_date" DATE NOT NULL,
    "status" "CorrespondenceStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "correspondence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "risk_id_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "RiskCategory" NOT NULL,
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "risk_score" INTEGER NOT NULL,
    "mitigation_plan" TEXT,
    "contingency_plan" TEXT,
    "review_date" DATE,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "raised_by" TEXT NOT NULL,
    "assigned_to" TEXT,
    "issue_number" TEXT NOT NULL,
    "issue_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "severity" "IssueSeverity" NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "due_date" DATE,
    "resolved_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punch_item" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "raised_by" TEXT NOT NULL,
    "assigned_to" TEXT,
    "punch_number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "room_or_area" TEXT,
    "trade_responsible" TEXT,
    "severity" "PunchItemSeverity" NOT NULL,
    "status" "PunchItemStatus" NOT NULL DEFAULT 'RAISED',
    "due_date" DATE,
    "corrected_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "punch_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closeout" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "practical_completion_date" DATE,
    "defects_liability_end_date" DATE,
    "final_completion_date" DATE,
    "status" "CloseoutStatus" NOT NULL DEFAULT 'PRACTICAL_COMPLETION',
    "contract_value" DECIMAL(18,2),
    "variations_total" DECIMAL(18,2),
    "claims_total" DECIMAL(18,2),
    "final_settlement" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "closeout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closeout_checklist_item" (
    "id" TEXT NOT NULL,
    "closeout_id" TEXT NOT NULL,
    "verified_by" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "closeout_checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty" (
    "id" TEXT NOT NULL,
    "closeout_id" TEXT NOT NULL,
    "item_description" TEXT NOT NULL,
    "supplier" TEXT,
    "start_date" DATE,
    "expiry_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "warranty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_project_company_id" ON "project"("company_id");

-- CreateIndex
CREATE INDEX "idx_project_company_deleted" ON "project"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_project_status" ON "project"("status");

-- CreateIndex
CREATE INDEX "idx_project_manager_id" ON "project"("project_manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_project_company_code" ON "project"("company_id", "project_code");

-- CreateIndex
CREATE INDEX "idx_project_team_project_id" ON "project_team"("project_id");

-- CreateIndex
CREATE INDEX "idx_project_team_user_id" ON "project_team"("user_id");

-- CreateIndex
CREATE INDEX "idx_project_team_deleted_at" ON "project_team"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_milestone_project_id" ON "milestone"("project_id");

-- CreateIndex
CREATE INDEX "idx_milestone_project_deleted" ON "milestone"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_task_project_id" ON "task"("project_id");

-- CreateIndex
CREATE INDEX "idx_task_project_deleted" ON "task"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_task_milestone_id" ON "task"("milestone_id");

-- CreateIndex
CREATE INDEX "idx_task_assigned_to" ON "task"("assigned_to");

-- CreateIndex
CREATE INDEX "idx_task_dependency_predecessor" ON "task_dependency"("predecessor_task_id");

-- CreateIndex
CREATE INDEX "idx_task_dependency_successor" ON "task_dependency"("successor_task_id");

-- CreateIndex
CREATE INDEX "idx_rfi_project_id" ON "rfi"("project_id");

-- CreateIndex
CREATE INDEX "idx_rfi_project_deleted" ON "rfi"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_rfi_status" ON "rfi"("status");

-- CreateIndex
CREATE INDEX "idx_rfi_response_rfi_id" ON "rfi_response"("rfi_id");

-- CreateIndex
CREATE INDEX "idx_submittal_project_id" ON "submittal"("project_id");

-- CreateIndex
CREATE INDEX "idx_submittal_project_deleted" ON "submittal"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_submittal_review_submittal_id" ON "submittal_review"("submittal_id");

-- CreateIndex
CREATE INDEX "idx_drawing_project_id" ON "drawing"("project_id");

-- CreateIndex
CREATE INDEX "idx_drawing_project_deleted" ON "drawing"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_drawing_version_drawing_id" ON "drawing_version"("drawing_id");

-- CreateIndex
CREATE INDEX "idx_drawing_link_drawing_id" ON "drawing_link"("drawing_id");

-- CreateIndex
CREATE INDEX "idx_drawing_link_entity" ON "drawing_link"("linked_entity_type", "linked_entity_id");

-- CreateIndex
CREATE INDEX "idx_daily_log_project_id" ON "daily_log"("project_id");

-- CreateIndex
CREATE INDEX "idx_daily_log_project_deleted" ON "daily_log"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_daily_log_workforce_log_id" ON "daily_log_workforce"("daily_log_id");

-- CreateIndex
CREATE INDEX "idx_daily_log_equipment_log_id" ON "daily_log_equipment"("daily_log_id");

-- CreateIndex
CREATE INDEX "idx_daily_log_visitor_log_id" ON "daily_log_visitor"("daily_log_id");

-- CreateIndex
CREATE INDEX "idx_daily_log_incident_log_id" ON "daily_log_incident"("daily_log_id");

-- CreateIndex
CREATE INDEX "idx_meeting_project_id" ON "meeting"("project_id");

-- CreateIndex
CREATE INDEX "idx_meeting_project_deleted" ON "meeting"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_meeting_agenda_meeting_id" ON "meeting_agenda_item"("meeting_id");

-- CreateIndex
CREATE INDEX "idx_meeting_attendee_meeting_id" ON "meeting_attendee"("meeting_id");

-- CreateIndex
CREATE INDEX "idx_action_item_meeting_id" ON "action_item"("meeting_id");

-- CreateIndex
CREATE INDEX "idx_correspondence_project_id" ON "correspondence"("project_id");

-- CreateIndex
CREATE INDEX "idx_correspondence_project_deleted" ON "correspondence"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_risk_project_id" ON "risk"("project_id");

-- CreateIndex
CREATE INDEX "idx_risk_project_deleted" ON "risk"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_issue_project_id" ON "issue"("project_id");

-- CreateIndex
CREATE INDEX "idx_issue_project_deleted" ON "issue"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_punch_item_project_id" ON "punch_item"("project_id");

-- CreateIndex
CREATE INDEX "idx_punch_item_project_deleted" ON "punch_item"("project_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "closeout_project_id_key" ON "closeout"("project_id");

-- CreateIndex
CREATE INDEX "idx_closeout_project_id" ON "closeout"("project_id");

-- CreateIndex
CREATE INDEX "idx_closeout_checklist_closeout_id" ON "closeout_checklist_item"("closeout_id");

-- CreateIndex
CREATE INDEX "idx_warranty_closeout_id" ON "warranty"("closeout_id");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_project_manager_id_fkey" FOREIGN KEY ("project_manager_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_team" ADD CONSTRAINT "project_team_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_team" ADD CONSTRAINT "project_team_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_predecessor_task_id_fkey" FOREIGN KEY ("predecessor_task_id") REFERENCES "task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_successor_task_id_fkey" FOREIGN KEY ("successor_task_id") REFERENCES "task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfi" ADD CONSTRAINT "rfi_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfi" ADD CONSTRAINT "rfi_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfi" ADD CONSTRAINT "rfi_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfi_response" ADD CONSTRAINT "rfi_response_rfi_id_fkey" FOREIGN KEY ("rfi_id") REFERENCES "rfi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfi_response" ADD CONSTRAINT "rfi_response_responded_by_fkey" FOREIGN KEY ("responded_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submittal" ADD CONSTRAINT "submittal_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submittal" ADD CONSTRAINT "submittal_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submittal" ADD CONSTRAINT "submittal_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submittal_review" ADD CONSTRAINT "submittal_review_submittal_id_fkey" FOREIGN KEY ("submittal_id") REFERENCES "submittal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submittal_review" ADD CONSTRAINT "submittal_review_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "document_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_version" ADD CONSTRAINT "drawing_version_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "drawing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_version" ADD CONSTRAINT "drawing_version_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_link" ADD CONSTRAINT "drawing_link_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "drawing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_log" ADD CONSTRAINT "daily_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_log" ADD CONSTRAINT "daily_log_site_engineer_id_fkey" FOREIGN KEY ("site_engineer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_log_workforce" ADD CONSTRAINT "daily_log_workforce_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "daily_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_log_equipment" ADD CONSTRAINT "daily_log_equipment_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "daily_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_log_visitor" ADD CONSTRAINT "daily_log_visitor_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "daily_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_log_incident" ADD CONSTRAINT "daily_log_incident_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "daily_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_agenda_item" ADD CONSTRAINT "meeting_agenda_item_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_agenda_item" ADD CONSTRAINT "meeting_agenda_item_presenter_id_fkey" FOREIGN KEY ("presenter_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendee" ADD CONSTRAINT "meeting_attendee_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendee" ADD CONSTRAINT "meeting_attendee_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk" ADD CONSTRAINT "risk_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk" ADD CONSTRAINT "risk_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_item" ADD CONSTRAINT "punch_item_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_item" ADD CONSTRAINT "punch_item_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_item" ADD CONSTRAINT "punch_item_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closeout" ADD CONSTRAINT "closeout_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closeout_checklist_item" ADD CONSTRAINT "closeout_checklist_item_closeout_id_fkey" FOREIGN KEY ("closeout_id") REFERENCES "closeout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closeout_checklist_item" ADD CONSTRAINT "closeout_checklist_item_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty" ADD CONSTRAINT "warranty_closeout_id_fkey" FOREIGN KEY ("closeout_id") REFERENCES "closeout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
