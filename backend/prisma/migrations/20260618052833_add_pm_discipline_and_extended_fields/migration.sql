-- CreateEnum
CREATE TYPE "UrgencyLevel" AS ENUM ('NORMAL', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TaskLanguage" AS ENUM ('CHINESE', 'ENGLISH');

-- CreateEnum
CREATE TYPE "ApprovalLevel" AS ENUM ('DEPARTMENT', 'INSTITUTE');

-- CreateEnum
CREATE TYPE "CompletionStatus" AS ENUM ('NORMAL', 'AHEAD', 'BEHIND');

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "client" TEXT,
ADD COLUMN     "commissioning_method" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "design_properties" TEXT,
ADD COLUMN     "design_stage" TEXT,
ADD COLUMN     "is_outsourced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "overall_progress_pct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "responsible_department_id" TEXT,
ADD COLUMN     "responsible_person_id" TEXT;

-- AlterTable
ALTER TABLE "task" ADD COLUMN     "actual_completion_time" TIMESTAMP(3),
ADD COLUMN     "actual_workdays" INTEGER,
ADD COLUMN     "approval_level" "ApprovalLevel",
ADD COLUMN     "assignment_to_hq_time" TIMESTAMP(3),
ADD COLUMN     "chief_engineer_name" TEXT,
ADD COLUMN     "commissioning_method" TEXT,
ADD COLUMN     "completion_status" "CompletionStatus",
ADD COLUMN     "contact_form_number" TEXT,
ADD COLUMN     "design_stage" TEXT,
ADD COLUMN     "dispatcher_name" TEXT,
ADD COLUMN     "has_custom_schedule" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "language" "TaskLanguage" NOT NULL DEFAULT 'CHINESE',
ADD COLUMN     "on_site_receiving_time" TIMESTAMP(3),
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "requires_archiving" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "responsible_person_id" TEXT,
ADD COLUMN     "task_attributes" TEXT,
ADD COLUMN     "urgency_level" "UrgencyLevel" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "task_discipline" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "discipline_name" TEXT NOT NULL,
    "designer_name" TEXT,
    "reviewer_name" TEXT,
    "disciplinary_leader" TEXT,
    "dept_chief_engineer" TEXT,
    "institute_chief_engineer" TEXT,
    "actual_completion_time" TIMESTAMP(3),
    "dept_review_time" TIMESTAMP(3),
    "institute_review_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "task_discipline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_task_discipline_task_id" ON "task_discipline"("task_id");

-- CreateIndex
CREATE INDEX "idx_task_discipline_company_id" ON "task_discipline"("company_id");

-- CreateIndex
CREATE INDEX "idx_project_responsible_department_id" ON "project"("responsible_department_id");

-- CreateIndex
CREATE INDEX "idx_project_responsible_person_id" ON "project"("responsible_person_id");

-- CreateIndex
CREATE INDEX "idx_task_responsible_person_id" ON "task"("responsible_person_id");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_responsible_department_id_fkey" FOREIGN KEY ("responsible_department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_responsible_person_id_fkey" FOREIGN KEY ("responsible_person_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_responsible_person_id_fkey" FOREIGN KEY ("responsible_person_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_discipline" ADD CONSTRAINT "task_discipline_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_discipline" ADD CONSTRAINT "task_discipline_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
