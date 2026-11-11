-- CreateEnum
CREATE TYPE "SealUrgency" AS ENUM ('CRITICALLY', 'URGENT', 'MEDIUM', 'MINOR');

-- CreateEnum
CREATE TYPE "SealStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'SEAL_ISSUED', 'RETURNED');

-- AlterEnum
ALTER TYPE "FolderContextType" ADD VALUE 'OFFICIAL_SEAL';
ALTER TYPE "FolderContextType" ADD VALUE 'PROJECT_SEAL';

-- CreateTable
CREATE TABLE "official_seal" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "request_number" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "urgency" "SealUrgency" NOT NULL DEFAULT 'MINOR',
    "status" "SealStatus" NOT NULL DEFAULT 'DRAFT',
    "approval_request_id" TEXT,
    "attachment_folder_id" TEXT,
    "date_needed" DATE NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "issued_by" TEXT,
    "issued_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "sealed_document_id" TEXT,

    CONSTRAINT "official_seal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_seal" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "request_number" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "urgency" "SealUrgency" NOT NULL DEFAULT 'MINOR',
    "status" "SealStatus" NOT NULL DEFAULT 'DRAFT',
    "approval_request_id" TEXT,
    "attachment_folder_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "date_needed" DATE NOT NULL,
    "issued_by" TEXT,
    "issued_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "sealed_document_id" TEXT,

    CONSTRAINT "project_seal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "official_seal_approval_request_id_key" ON "official_seal"("approval_request_id");

-- CreateIndex
CREATE INDEX "idx_official_seal_company" ON "official_seal"("company_id");

-- CreateIndex
CREATE INDEX "idx_official_seal_employee" ON "official_seal"("employee_id");

-- CreateIndex
CREATE INDEX "idx_official_seal_issuer" ON "official_seal"("issued_by");

-- CreateIndex
CREATE INDEX "idx_official_seal_status" ON "official_seal"("status");

-- CreateIndex
CREATE INDEX "idx_official_seal_company_deleted" ON "official_seal"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_official_seal_attachment_folder" ON "official_seal"("attachment_folder_id");

-- CreateIndex
CREATE INDEX "idx_official_seal_document" ON "official_seal"("sealed_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_official_seal_company_number" ON "official_seal"("company_id", "request_number");

-- CreateIndex
CREATE UNIQUE INDEX "project_seal_approval_request_id_key" ON "project_seal"("approval_request_id");

-- CreateIndex
CREATE INDEX "idx_project_seal_company" ON "project_seal"("company_id");

-- CreateIndex
CREATE INDEX "idx_project_seal_company_deleted" ON "project_seal"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_project_seal_employee" ON "project_seal"("employee_id");

-- CreateIndex
CREATE INDEX "idx_project_seal_issuer" ON "project_seal"("issued_by");

-- CreateIndex
CREATE INDEX "idx_project_seal_status" ON "project_seal"("status");

-- CreateIndex
CREATE INDEX "idx_project_seal_attachment_folder" ON "project_seal"("attachment_folder_id");

-- CreateIndex
CREATE INDEX "idx_project_seal_document" ON "project_seal"("sealed_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_project_seal_company_number" ON "project_seal"("company_id", "request_number");

-- AddForeignKey
ALTER TABLE "official_seal" ADD CONSTRAINT "official_seal_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_seal" ADD CONSTRAINT "official_seal_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_seal" ADD CONSTRAINT "official_seal_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_seal" ADD CONSTRAINT "official_seal_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_seal" ADD CONSTRAINT "official_seal_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_seal" ADD CONSTRAINT "official_seal_attachment_folder_id_fkey" FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_seal" ADD CONSTRAINT "official_seal_sealed_document_id_fkey" FOREIGN KEY ("sealed_document_id") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_seal" ADD CONSTRAINT "project_seal_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_seal" ADD CONSTRAINT "project_seal_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_seal" ADD CONSTRAINT "project_seal_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_seal" ADD CONSTRAINT "project_seal_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_seal" ADD CONSTRAINT "project_seal_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_seal" ADD CONSTRAINT "project_seal_attachment_folder_id_fkey" FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_seal" ADD CONSTRAINT "project_seal_sealed_document_id_fkey" FOREIGN KEY ("sealed_document_id") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
