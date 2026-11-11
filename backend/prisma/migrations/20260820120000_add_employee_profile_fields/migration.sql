-- Employee profile fields, leave policies, and contract compensation.

CREATE TYPE "Nationality" AS ENUM ('ETHIOPIAN', 'CHINESE');
CREATE TYPE "EmployeeType" AS ENUM ('PERMANENT', 'CONTRACT', 'TEMPORARY');
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');
CREATE TYPE "EducationLevel" AS ENUM ('PHD', 'MSC', 'BSC', 'DIPLOMA', 'CERTIFICATE', 'OTHER');

ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'EMPLOYEE_PROFILE';

CREATE SEQUENCE IF NOT EXISTS "employee_id_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE "leave_policy" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    CONSTRAINT "leave_policy_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "employee_id" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "middle_name" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "gender" "Gender";
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "date_of_birth" DATE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "national_id" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "nationality" "Nationality";
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "employee_type" "EmployeeType";
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "education_level" "EducationLevel";
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "field_of_study" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "experience_start_date" DATE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emergency_contact_name" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emergency_contact_phone" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "leave_policy_id" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "profile_folder_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "user_employee_id_key" ON "user"("employee_id");
CREATE INDEX IF NOT EXISTS "idx_user_leave_policy" ON "user"("leave_policy_id");
CREATE INDEX IF NOT EXISTS "idx_user_profile_folder" ON "user"("profile_folder_id");
CREATE INDEX IF NOT EXISTS "idx_user_employee_id" ON "user"("employee_id");

ALTER TABLE "employee_contract" ADD COLUMN IF NOT EXISTS "basic_salary" DECIMAL(14,2);
ALTER TABLE "employee_contract" ADD COLUMN IF NOT EXISTS "transportation_allowance" DECIMAL(14,2);
ALTER TABLE "employee_contract" ADD COLUMN IF NOT EXISTS "monthly_bonus" DECIMAL(14,2);
ALTER TABLE "employee_contract" ADD COLUMN IF NOT EXISTS "net_salary" DECIMAL(14,2);
ALTER TABLE "employee_contract" ADD COLUMN IF NOT EXISTS "probation_end_date" DATE;
ALTER TABLE "employee_contract" ADD COLUMN IF NOT EXISTS "governed_by" TEXT;

CREATE INDEX IF NOT EXISTS "idx_leave_policy_company" ON "leave_policy"("company_id");
CREATE INDEX IF NOT EXISTS "idx_leave_policy_company_deleted" ON "leave_policy"("company_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "idx_leave_policy_company_active" ON "leave_policy"("company_id", "is_active");

ALTER TABLE "leave_policy" ADD CONSTRAINT "leave_policy_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user" ADD CONSTRAINT "user_leave_policy_id_fkey"
  FOREIGN KEY ("leave_policy_id") REFERENCES "leave_policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user" ADD CONSTRAINT "user_profile_folder_id_fkey"
  FOREIGN KEY ("profile_folder_id") REFERENCES "document_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
