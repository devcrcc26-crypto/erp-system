-- Employment separation (phase 1): additive only.
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SEPARATED');
CREATE TYPE "SeparationType" AS ENUM ('RESIGNATION', 'TERMINATION', 'CONTRACT_END', 'DEATH', 'OTHER');

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "employment_status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE IF NOT EXISTS "employment_period" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "separation_type" "SeparationType",
  "separation_reason" TEXT,
  "separated_by_id" TEXT,
  "separated_at" TIMESTAMP(3),
  "separation_contract_id" TEXT,
  "separation_contract_prev_end_date" DATE,
  "login_disabled_by_separation" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employment_period_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_employment_period_user" ON "employment_period"("user_id");
CREATE INDEX IF NOT EXISTS "idx_employment_period_company_end" ON "employment_period"("company_id", "end_date");

ALTER TABLE "employment_period"
  ADD CONSTRAINT "employment_period_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employment_period"
  ADD CONSTRAINT "employment_period_separated_by_id_fkey"
  FOREIGN KEY ("separated_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "payroll_entry_flag" ADD VALUE IF NOT EXISTS 'LEAVER_FINAL_MONTH';
ALTER TYPE "payroll_entry_flag" ADD VALUE IF NOT EXISTS 'LOGIN_DISABLED_STILL_EMPLOYED';
ALTER TYPE "AttendanceDayFlag" ADD VALUE IF NOT EXISTS 'SCAN_AFTER_SEPARATION';
