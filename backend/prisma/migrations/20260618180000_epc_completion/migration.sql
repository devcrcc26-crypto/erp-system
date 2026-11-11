-- CreateEnum
CREATE TYPE "ProjectTeamRole" AS ENUM ('PROJECT_MANAGER', 'DISPATCHER', 'SITE_COORDINATOR', 'DEPARTMENT_CHIEF', 'INSTITUTE_CHIEF', 'DEPUTY_CHIEF', 'DOCUMENT_CONTROLLER', 'OTHER');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'WAIVED');

-- CreateEnum
CREATE TYPE "TaskDisciplineReviewStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ProjectChangeRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProjectChangeRequestSource" AS ENUM ('RFI', 'SUBMITTAL_REVIEW', 'EXTERNAL_TRIGGER', 'MANUAL');

-- AlterTable
ALTER TABLE "project_team" ALTER COLUMN "role_on_project" DROP DEFAULT;
ALTER TABLE "project_team" ALTER COLUMN "role_on_project" TYPE "ProjectTeamRole" USING (
  CASE
    WHEN "role_on_project" ILIKE '%manager%' THEN 'PROJECT_MANAGER'::"ProjectTeamRole"
    WHEN "role_on_project" ILIKE '%dispatcher%' THEN 'DISPATCHER'::"ProjectTeamRole"
    WHEN "role_on_project" ILIKE '%coordinator%' THEN 'SITE_COORDINATOR'::"ProjectTeamRole"
    WHEN "role_on_project" ILIKE '%deputy%' THEN 'DEPUTY_CHIEF'::"ProjectTeamRole"
    WHEN "role_on_project" ILIKE '%document%' THEN 'DOCUMENT_CONTROLLER'::"ProjectTeamRole"
    WHEN "role_on_project" ILIKE '%chief%' THEN 'DEPARTMENT_CHIEF'::"ProjectTeamRole"
    ELSE 'OTHER'::"ProjectTeamRole"
  END
);
ALTER TABLE "project_team" ALTER COLUMN "role_on_project" SET DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "deliverable" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "task_discipline_id" TEXT,
    "design_package_id" TEXT,
    "engineering_document_id" TEXT,
    "name" TEXT NOT NULL,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'PLANNED',
    "due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_discipline_review" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "task_discipline_id" TEXT NOT NULL,
    "review_tier" "ReviewTier" NOT NULL,
    "status" "TaskDisciplineReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "task_discipline_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_change_request" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "change_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectChangeRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "source_type" "ProjectChangeRequestSource" NOT NULL,
    "source_entity_id" TEXT,
    "external_review_trigger_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "project_change_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_deliverable_company_id" ON "deliverable"("company_id");
CREATE INDEX "idx_deliverable_company_deleted" ON "deliverable"("company_id", "deleted_at");
CREATE INDEX "idx_deliverable_project_id" ON "deliverable"("project_id");
CREATE INDEX "idx_deliverable_task_discipline_id" ON "deliverable"("task_discipline_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_task_discipline_review_tier" ON "task_discipline_review"("task_discipline_id", "review_tier");
CREATE INDEX "idx_task_discipline_review_company_id" ON "task_discipline_review"("company_id");
CREATE INDEX "idx_task_discipline_review_company_deleted" ON "task_discipline_review"("company_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_project_change_request_company_number" ON "project_change_request"("company_id", "change_number");
CREATE INDEX "idx_project_change_request_company_id" ON "project_change_request"("company_id");
CREATE INDEX "idx_project_change_request_company_deleted" ON "project_change_request"("company_id", "deleted_at");
CREATE INDEX "idx_project_change_request_project_id" ON "project_change_request"("project_id");
CREATE INDEX "idx_project_change_request_status" ON "project_change_request"("status");

-- AddForeignKey
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_task_discipline_id_fkey" FOREIGN KEY ("task_discipline_id") REFERENCES "task_discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_design_package_id_fkey" FOREIGN KEY ("design_package_id") REFERENCES "design_package"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_engineering_document_id_fkey" FOREIGN KEY ("engineering_document_id") REFERENCES "engineering_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_discipline_review" ADD CONSTRAINT "task_discipline_review_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_discipline_review" ADD CONSTRAINT "task_discipline_review_task_discipline_id_fkey" FOREIGN KEY ("task_discipline_id") REFERENCES "task_discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_change_request" ADD CONSTRAINT "project_change_request_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_change_request" ADD CONSTRAINT "project_change_request_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
