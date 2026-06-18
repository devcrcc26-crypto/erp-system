-- CreateEnum
CREATE TYPE "EngineeringDocumentType" AS ENUM ('DRAWING', 'REPORT', 'CALCULATION', 'SPECIFICATION', 'PROGRAMME_SCHEDULE', 'OTHER');

-- CreateEnum
CREATE TYPE "EdvStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'LOCKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DesignPackageProjectedStatus" AS ENUM ('IN_PROGRESS', 'PENDING_LEAD', 'APPROVED', 'REWORK_REQUIRED');

-- CreateEnum
CREATE TYPE "TaskDisciplineProjectedStatus" AS ENUM ('IN_PROGRESS', 'PENDING_LEAD', 'APPROVED', 'REWORK_REQUIRED');

-- CreateEnum
CREATE TYPE "DesignPackageDependencyType" AS ENUM ('FINISH_TO_START', 'COORDINATION_ONLY');

-- CreateEnum
CREATE TYPE "WorkflowEventPhase" AS ENUM ('INTENT', 'COMMITTED', 'CORRECTION');

-- CreateEnum
CREATE TYPE "WorkflowEntityType" AS ENUM ('EngineeringDocumentVersion', 'DesignPackage', 'TaskDiscipline', 'ReviewSession', 'ReviewComment', 'Submittal');

-- AlterEnum
ALTER TYPE "FolderContextType" ADD VALUE 'TASK_DISCIPLINE';

-- AlterTable
ALTER TABLE "task_discipline" ADD COLUMN "projected_status" "TaskDisciplineProjectedStatus" NOT NULL DEFAULT 'IN_PROGRESS',
ADD COLUMN "designer_user_id" TEXT,
ADD COLUMN "reviewer_user_id" TEXT,
ADD COLUMN "discipline_lead_user_id" TEXT,
ADD COLUMN "chief_user_id" TEXT,
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updated_by" TEXT,
ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by" TEXT;

UPDATE "task_discipline" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
ALTER TABLE "task_discipline" ALTER COLUMN "updated_by" SET NOT NULL;

-- CreateTable
CREATE TABLE "engineering_document" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "task_discipline_id" TEXT NOT NULL,
    "document_type" "EngineeringDocumentType" NOT NULL,
    "document_number" TEXT,
    "title" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "engineering_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_document_version" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "engineering_document_id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "revision_label" TEXT NOT NULL,
    "status" "EdvStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "engineering_document_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_package" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "task_discipline_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projected_status" "DesignPackageProjectedStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "projection_pending" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "design_package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_package_item" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "design_package_id" TEXT NOT NULL,
    "engineering_document_version_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "design_package_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_package_dependency" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "design_package_id" TEXT NOT NULL,
    "depends_on_package_id" TEXT NOT NULL,
    "dependency_type" "DesignPackageDependencyType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "design_package_dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_event_log" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "entity_type" "WorkflowEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "phase" "WorkflowEventPhase" NOT NULL,
    "before_state" JSONB NOT NULL DEFAULT '{}',
    "after_state" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT,
    "correlation_id" TEXT,
    "corrects_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_engineering_document_company_id" ON "engineering_document"("company_id");
CREATE INDEX "idx_engineering_document_company_deleted" ON "engineering_document"("company_id", "deleted_at");
CREATE INDEX "idx_engineering_document_task_discipline_id" ON "engineering_document"("task_discipline_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_edv_document_revision_label" ON "engineering_document_version"("engineering_document_id", "revision_label");
CREATE INDEX "idx_engineering_document_version_company_id" ON "engineering_document_version"("company_id");
CREATE INDEX "idx_engineering_document_version_company_deleted" ON "engineering_document_version"("company_id", "deleted_at");
CREATE INDEX "idx_engineering_document_version_document_id" ON "engineering_document_version"("engineering_document_id");
CREATE INDEX "idx_engineering_document_version_doc_version_id" ON "engineering_document_version"("document_version_id");
CREATE INDEX "idx_engineering_document_version_status" ON "engineering_document_version"("status");

-- CreateIndex
CREATE INDEX "idx_design_package_company_id" ON "design_package"("company_id");
CREATE INDEX "idx_design_package_company_deleted" ON "design_package"("company_id", "deleted_at");
CREATE INDEX "idx_design_package_task_discipline_id" ON "design_package"("task_discipline_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_design_package_item_package_edv" ON "design_package_item"("design_package_id", "engineering_document_version_id");
CREATE INDEX "idx_design_package_item_company_id" ON "design_package_item"("company_id");
CREATE INDEX "idx_design_package_item_package_id" ON "design_package_item"("design_package_id");
CREATE INDEX "idx_design_package_item_edv_id" ON "design_package_item"("engineering_document_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_design_package_dependency" ON "design_package_dependency"("design_package_id", "depends_on_package_id");
CREATE INDEX "idx_design_package_dependency_company_id" ON "design_package_dependency"("company_id");
CREATE INDEX "idx_design_package_dependency_package_id" ON "design_package_dependency"("design_package_id");
CREATE INDEX "idx_design_package_dependency_depends_on_id" ON "design_package_dependency"("depends_on_package_id");

-- CreateIndex
CREATE INDEX "idx_workflow_event_log_company_id" ON "workflow_event_log"("company_id");
CREATE INDEX "idx_workflow_event_log_entity" ON "workflow_event_log"("entity_type", "entity_id");
CREATE INDEX "idx_workflow_event_log_correlation_id" ON "workflow_event_log"("correlation_id");
CREATE INDEX "idx_workflow_event_log_created_at" ON "workflow_event_log"("created_at");

-- CreateIndex
CREATE INDEX "idx_task_discipline_company_deleted" ON "task_discipline"("company_id", "deleted_at");
CREATE INDEX "idx_task_discipline_designer_user_id" ON "task_discipline"("designer_user_id");
CREATE INDEX "idx_task_discipline_reviewer_user_id" ON "task_discipline"("reviewer_user_id");

-- AddForeignKey
ALTER TABLE "task_discipline" ADD CONSTRAINT "task_discipline_designer_user_id_fkey" FOREIGN KEY ("designer_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_discipline" ADD CONSTRAINT "task_discipline_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_discipline" ADD CONSTRAINT "task_discipline_discipline_lead_user_id_fkey" FOREIGN KEY ("discipline_lead_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_discipline" ADD CONSTRAINT "task_discipline_chief_user_id_fkey" FOREIGN KEY ("chief_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "engineering_document" ADD CONSTRAINT "engineering_document_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "engineering_document" ADD CONSTRAINT "engineering_document_task_discipline_id_fkey" FOREIGN KEY ("task_discipline_id") REFERENCES "task_discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "engineering_document_version" ADD CONSTRAINT "engineering_document_version_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "engineering_document_version" ADD CONSTRAINT "engineering_document_version_engineering_document_id_fkey" FOREIGN KEY ("engineering_document_id") REFERENCES "engineering_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "engineering_document_version" ADD CONSTRAINT "engineering_document_version_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "design_package" ADD CONSTRAINT "design_package_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "design_package" ADD CONSTRAINT "design_package_task_discipline_id_fkey" FOREIGN KEY ("task_discipline_id") REFERENCES "task_discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "design_package_item" ADD CONSTRAINT "design_package_item_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "design_package_item" ADD CONSTRAINT "design_package_item_design_package_id_fkey" FOREIGN KEY ("design_package_id") REFERENCES "design_package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "design_package_item" ADD CONSTRAINT "design_package_item_engineering_document_version_id_fkey" FOREIGN KEY ("engineering_document_version_id") REFERENCES "engineering_document_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "design_package_dependency" ADD CONSTRAINT "design_package_dependency_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "design_package_dependency" ADD CONSTRAINT "design_package_dependency_design_package_id_fkey" FOREIGN KEY ("design_package_id") REFERENCES "design_package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "design_package_dependency" ADD CONSTRAINT "design_package_dependency_depends_on_package_id_fkey" FOREIGN KEY ("depends_on_package_id") REFERENCES "design_package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_event_log" ADD CONSTRAINT "workflow_event_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_event_log" ADD CONSTRAINT "workflow_event_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
