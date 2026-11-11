-- CreateEnum
CREATE TYPE "SubmittalItemType" AS ENUM ('DESIGN_PACKAGE');

-- CreateEnum
CREATE TYPE "ExternalReviewTriggerType" AS ENUM ('RFI', 'CHANGE_REQUEST', 'SUBMITTAL_REVIEW');

-- CreateEnum
CREATE TYPE "ExternalReviewTriggerStatus" AS ENUM ('PENDING', 'PROCESSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "submittal" ADD COLUMN "issued_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "submittal_item" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "submittal_id" TEXT NOT NULL,
    "design_package_id" TEXT NOT NULL,
    "item_type" "SubmittalItemType" NOT NULL DEFAULT 'DESIGN_PACKAGE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "snapshot_captured" BOOLEAN NOT NULL DEFAULT false,
    "snapshot_edv_ids" TEXT[],
    "snapshot_payload" JSONB NOT NULL DEFAULT '[]',
    "content_hash" TEXT,
    "captured_at" TIMESTAMP(3),
    "captured_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "submittal_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_review_trigger" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "trigger_type" "ExternalReviewTriggerType" NOT NULL,
    "source_entity_type" TEXT NOT NULL,
    "source_entity_id" TEXT NOT NULL,
    "submittal_id" TEXT,
    "submittal_item_ids" TEXT[],
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "ExternalReviewTriggerStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "external_review_trigger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_submittal_item_submittal_package" ON "submittal_item"("submittal_id", "design_package_id");

-- CreateIndex
CREATE INDEX "idx_submittal_item_company_id" ON "submittal_item"("company_id");

-- CreateIndex
CREATE INDEX "idx_submittal_item_submittal_id" ON "submittal_item"("submittal_id");

-- CreateIndex
CREATE INDEX "idx_submittal_item_design_package_id" ON "submittal_item"("design_package_id");

-- CreateIndex
CREATE INDEX "idx_external_review_trigger_company_id" ON "external_review_trigger"("company_id");

-- CreateIndex
CREATE INDEX "idx_external_review_trigger_project_id" ON "external_review_trigger"("project_id");

-- CreateIndex
CREATE INDEX "idx_external_review_trigger_submittal_id" ON "external_review_trigger"("submittal_id");

-- CreateIndex
CREATE INDEX "idx_external_review_trigger_status" ON "external_review_trigger"("status");

-- AddForeignKey
ALTER TABLE "submittal_item" ADD CONSTRAINT "submittal_item_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submittal_item" ADD CONSTRAINT "submittal_item_submittal_id_fkey" FOREIGN KEY ("submittal_id") REFERENCES "submittal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submittal_item" ADD CONSTRAINT "submittal_item_design_package_id_fkey" FOREIGN KEY ("design_package_id") REFERENCES "design_package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_review_trigger" ADD CONSTRAINT "external_review_trigger_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_review_trigger" ADD CONSTRAINT "external_review_trigger_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_review_trigger" ADD CONSTRAINT "external_review_trigger_submittal_id_fkey" FOREIGN KEY ("submittal_id") REFERENCES "submittal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
