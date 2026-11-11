-- CreateEnum
CREATE TYPE "ExitDirection" AS ENUM ('ENTRANCE', 'EXIT');

-- CreateEnum
CREATE TYPE "ExitPermitStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "FolderContextType" ADD VALUE 'EXIT_PERMIT';

-- AlterTable
ALTER TABLE "business_trip" ALTER COLUMN "departure_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "return_date" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "flight_application" ALTER COLUMN "departure_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "return_date" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "per_diem_request" ALTER COLUMN "start_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "end_date" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "exit_permit" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "department_id" TEXT,
    "employee_id" TEXT NOT NULL,
    "request_number" TEXT NOT NULL,
    "direction" "ExitDirection" NOT NULL DEFAULT 'EXIT',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ExitPermitStatus" NOT NULL DEFAULT 'DRAFT',
    "approval_request_id" TEXT,
    "attachment_folder_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "exit_permit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_permit_item" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "issue" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "document_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exit_permit_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exit_permit_approval_request_id_key" ON "exit_permit"("approval_request_id");

-- CreateIndex
CREATE INDEX "idx_exit_permit_company" ON "exit_permit"("request_number");

-- CreateIndex
CREATE INDEX "idx_exit_permit_employee" ON "exit_permit"("employee_id");

-- CreateIndex
CREATE INDEX "idx_exit_permit_status" ON "exit_permit"("status");

-- CreateIndex
CREATE INDEX "idx_exit_permit_company_created" ON "exit_permit"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_exit_permit_company_deleted" ON "exit_permit"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_exit_permit_department" ON "exit_permit"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "exit_permit_company_id_request_number_key" ON "exit_permit"("company_id", "request_number");

-- CreateIndex
CREATE INDEX "idx_exit_permit_item_request" ON "exit_permit_item"("request_id");

-- CreateIndex
CREATE INDEX "idx_exit_permit_item_document" ON "exit_permit_item"("document_id");

-- AddForeignKey
ALTER TABLE "exit_permit" ADD CONSTRAINT "exit_permit_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_permit" ADD CONSTRAINT "exit_permit_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_permit" ADD CONSTRAINT "exit_permit_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_permit" ADD CONSTRAINT "exit_permit_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_permit" ADD CONSTRAINT "exit_permit_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_permit" ADD CONSTRAINT "exit_permit_attachment_folder_id_fkey" FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_permit_item" ADD CONSTRAINT "exit_permit_item_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "exit_permit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_permit_item" ADD CONSTRAINT "exit_permit_item_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
