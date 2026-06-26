-- AlterEnum
ALTER TYPE "ExternalReviewTriggerType" ADD VALUE 'ISSUE';

-- AlterEnum
ALTER TYPE "ExternalReviewTriggerStatus" ADD VALUE 'PARTIAL';
ALTER TYPE "ExternalReviewTriggerStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "rfi" ADD COLUMN "linked_design_package_id" TEXT;

-- AlterTable
ALTER TABLE "issue" ADD COLUMN "linked_design_package_id" TEXT;

-- AlterTable
ALTER TABLE "project_change_request" ADD COLUMN "linked_design_package_id" TEXT;

-- AlterTable
ALTER TABLE "external_review_trigger" ADD COLUMN "linked_design_package_id" TEXT;

-- CreateIndex
CREATE INDEX "idx_rfi_linked_design_package_id" ON "rfi"("linked_design_package_id");

-- CreateIndex
CREATE INDEX "idx_issue_linked_design_package_id" ON "issue"("linked_design_package_id");

-- CreateIndex
CREATE INDEX "idx_project_change_request_linked_package_id" ON "project_change_request"("linked_design_package_id");

-- CreateIndex
CREATE INDEX "idx_external_review_trigger_linked_package_id" ON "external_review_trigger"("linked_design_package_id");

-- AddForeignKey
ALTER TABLE "rfi" ADD CONSTRAINT "rfi_linked_design_package_id_fkey" FOREIGN KEY ("linked_design_package_id") REFERENCES "design_package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_linked_design_package_id_fkey" FOREIGN KEY ("linked_design_package_id") REFERENCES "design_package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_change_request" ADD CONSTRAINT "project_change_request_linked_design_package_id_fkey" FOREIGN KEY ("linked_design_package_id") REFERENCES "design_package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_review_trigger" ADD CONSTRAINT "external_review_trigger_linked_design_package_id_fkey" FOREIGN KEY ("linked_design_package_id") REFERENCES "design_package"("id") ON DELETE SET NULL ON UPDATE CASCADE;
