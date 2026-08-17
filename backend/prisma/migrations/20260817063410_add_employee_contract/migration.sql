-- Employee Contract module only.
-- Do not include schema-drift fixes here (generated columns on business_trip, leave_balance, overtime, etc.).

-- CreateEnum
CREATE TYPE "EmployeeContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'TERMINATED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EmployeeContractType" AS ENUM ('FIXED_TERM', 'OPEN_ENDED', 'PROBATION', 'RENEWAL');

-- AlterEnum
ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'EMPLOYEE_CONTRACT';

-- CreateTable
CREATE TABLE "employee_contract" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "contract_number" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "contract_type" "EmployeeContractType" NOT NULL DEFAULT 'FIXED_TERM',
    "status" "EmployeeContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "signed_at" DATE NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "terminated_at" DATE,
    "termination_reason" TEXT,
    "notes" TEXT,
    "last_warned_at" TIMESTAMP(3),
    "attachment_folder_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "employee_contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_employee_contract_company" ON "employee_contract"("company_id");

-- CreateIndex
CREATE INDEX "idx_employee_contract_company_deleted" ON "employee_contract"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_employee_contract_employee" ON "employee_contract"("employee_id");

-- CreateIndex
CREATE INDEX "idx_employee_contract_status" ON "employee_contract"("status");

-- CreateIndex
CREATE INDEX "idx_employee_contract_attachment_folder" ON "employee_contract"("attachment_folder_id");

-- CreateIndex
CREATE INDEX "idx_employee_contract_expiring" ON "employee_contract"("company_id", "status", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_employee_contract_company_number" ON "employee_contract"("company_id", "contract_number");

-- AddForeignKey
ALTER TABLE "employee_contract" ADD CONSTRAINT "employee_contract_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contract" ADD CONSTRAINT "employee_contract_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contract" ADD CONSTRAINT "employee_contract_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contract" ADD CONSTRAINT "employee_contract_attachment_folder_id_fkey" FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE SEQUENCE IF NOT EXISTS "employee_contract_number_seq";
