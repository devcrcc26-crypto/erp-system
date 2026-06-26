-- CreateEnum
CREATE TYPE "ExternalReviewTriggerMode" AS ENUM ('REVISION', 'NEW_PACKAGE');

-- CreateEnum
CREATE TYPE "DesignPackageStatus" AS ENUM ('OPEN', 'SUBMITTED', 'CLOSED');

-- AlterEnum
ALTER TYPE "DesignPackageProjectedStatus" ADD VALUE 'LOCKED';

-- AlterEnum
ALTER TYPE "ReviewTier" ADD VALUE 'INSTITUTE_CHIEF';

-- AlterTable
ALTER TABLE "design_package" ADD COLUMN     "brief_text" TEXT,
ADD COLUMN     "package_closed_at" TIMESTAMP(3),
ADD COLUMN     "package_closed_by" TEXT,
ADD COLUMN     "package_status" "DesignPackageStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "required_tiers" "ReviewTier"[],
ADD COLUMN     "source_entity_id" TEXT,
ADD COLUMN     "source_entity_type" TEXT;

-- AlterTable
ALTER TABLE "engineering_document_version" ADD COLUMN     "is_current" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "external_review_trigger" ADD COLUMN     "trigger_mode" "ExternalReviewTriggerMode" NOT NULL DEFAULT 'REVISION';

-- AlterTable
ALTER TABLE "task_discipline" ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "closed_by" TEXT,
ADD COLUMN     "institute_chief_user_id" TEXT,
ADD COLUMN     "is_closed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supporting_designer_user_id" TEXT;

-- CreateTable
CREATE TABLE "design_package_attachments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "design_package_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "attached_by" TEXT NOT NULL,
    "attached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purpose" TEXT,
    "note" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "design_package_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_session_attachments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "review_session_id" TEXT NOT NULL,
    "tier" "ReviewTier" NOT NULL,
    "attached_by_user_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "attached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purpose" TEXT,
    "note" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "review_session_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_design_package_attachment_company_id" ON "design_package_attachments"("company_id");

-- CreateIndex
CREATE INDEX "idx_design_package_attachment_package_id" ON "design_package_attachments"("design_package_id");

-- CreateIndex
CREATE INDEX "idx_design_package_attachment_document_id" ON "design_package_attachments"("document_id");

-- CreateIndex
CREATE INDEX "idx_review_session_attachment_company_id" ON "review_session_attachments"("company_id");

-- CreateIndex
CREATE INDEX "idx_review_session_attachment_session_id" ON "review_session_attachments"("review_session_id");

-- CreateIndex
CREATE INDEX "idx_review_session_attachment_document_id" ON "review_session_attachments"("document_id");

-- CreateIndex
CREATE INDEX "idx_task_discipline_institute_chief_user_id" ON "task_discipline"("institute_chief_user_id");

-- CreateIndex
CREATE INDEX "idx_task_discipline_supporting_designer_user_id" ON "task_discipline"("supporting_designer_user_id");

-- AddForeignKey
ALTER TABLE "task_discipline" ADD CONSTRAINT "task_discipline_institute_chief_user_id_fkey" FOREIGN KEY ("institute_chief_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_discipline" ADD CONSTRAINT "task_discipline_supporting_designer_user_id_fkey" FOREIGN KEY ("supporting_designer_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_package_attachments" ADD CONSTRAINT "design_package_attachments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_package_attachments" ADD CONSTRAINT "design_package_attachments_design_package_id_fkey" FOREIGN KEY ("design_package_id") REFERENCES "design_package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_package_attachments" ADD CONSTRAINT "design_package_attachments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_package_attachments" ADD CONSTRAINT "design_package_attachments_attached_by_fkey" FOREIGN KEY ("attached_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_session_attachments" ADD CONSTRAINT "review_session_attachments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_session_attachments" ADD CONSTRAINT "review_session_attachments_review_session_id_fkey" FOREIGN KEY ("review_session_id") REFERENCES "review_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_session_attachments" ADD CONSTRAINT "review_session_attachments_attached_by_user_id_fkey" FOREIGN KEY ("attached_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_session_attachments" ADD CONSTRAINT "review_session_attachments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "project_team_member_unique" RENAME TO "project_team_project_id_user_id_key";
