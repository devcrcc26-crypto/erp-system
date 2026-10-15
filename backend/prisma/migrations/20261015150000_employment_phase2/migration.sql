-- Employment separation phase 2: inactive periods, contract-ended notice, final settlement. Additive only.
CREATE TYPE "InactiveType" AS ENUM ('SUSPENDED', 'LONG_LEAVE', 'OTHER');

CREATE TABLE IF NOT EXISTS "inactive_period" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "InactiveType" NOT NULL,
  "from_date" DATE NOT NULL,
  "to_date" DATE,
  "reason" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_by_id" TEXT,
  "ended_at" TIMESTAMP(3),
  "login_disabled_by_inactive" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "inactive_period_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_inactive_period_user" ON "inactive_period"("user_id");
CREATE INDEX IF NOT EXISTS "idx_inactive_period_company_from" ON "inactive_period"("company_id", "from_date");
ALTER TABLE "inactive_period"
  ADD CONSTRAINT "inactive_period_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AttendanceDayStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';
ALTER TYPE "payroll_entry_flag" ADD VALUE IF NOT EXISTS 'INACTIVE_IN_MONTH';
ALTER TYPE "payroll_entry_flag" ADD VALUE IF NOT EXISTS 'CONTRACT_ENDED_NOT_RENEWED';

ALTER TABLE "employee_contract" ADD COLUMN IF NOT EXISTS "ended_notice_at" TIMESTAMP(3);

ALTER TABLE "payroll_entry"
  ADD COLUMN IF NOT EXISTS "unused_leave_payout" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "severance_pay" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "notice_pay" DECIMAL(14, 2) NOT NULL DEFAULT 0;
