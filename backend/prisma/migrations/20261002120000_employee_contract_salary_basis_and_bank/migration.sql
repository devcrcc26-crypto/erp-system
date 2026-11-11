-- AlterTable User: payroll bank details
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "bank_name" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "bank_branch" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "bank_account_number" TEXT;

-- CreateEnum SalaryBasis
DO $$ BEGIN
  CREATE TYPE "SalaryBasis" AS ENUM ('GROSS', 'NET');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable EmployeeContract: salary basis and tax/pension flags
ALTER TABLE "employee_contract" ADD COLUMN IF NOT EXISTS "salary_basis" "SalaryBasis" NOT NULL DEFAULT 'GROSS';
ALTER TABLE "employee_contract" ADD COLUMN IF NOT EXISTS "pension_applicable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "employee_contract" ADD COLUMN IF NOT EXISTS "tax_applicable" BOOLEAN NOT NULL DEFAULT true;
