-- Payroll correction runs: type, original link, SUPERSEDED status, delta columns.

CREATE TYPE "payroll_run_type" AS ENUM ('REGULAR', 'CORRECTION');

ALTER TYPE "payroll_run_status" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

ALTER TABLE "payroll_run"
  ADD COLUMN "type" "payroll_run_type" NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN "original_run_id" TEXT;

ALTER TABLE "payroll_run"
  ADD CONSTRAINT "payroll_run_original_run_id_fkey"
  FOREIGN KEY ("original_run_id") REFERENCES "payroll_run"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "uq_payroll_run_company_month_year";

CREATE INDEX "idx_payroll_run_company_month_year"
  ON "payroll_run"("company_id", "month", "year");

CREATE INDEX "idx_payroll_run_original"
  ON "payroll_run"("original_run_id");

-- One REGULAR run per company/month (soft-deleted rows excluded).
CREATE UNIQUE INDEX "uq_payroll_run_regular_company_month_year"
  ON "payroll_run"("company_id", "month", "year")
  WHERE "type" = 'REGULAR' AND "deleted_at" IS NULL;

ALTER TABLE "payroll_entry"
  ADD COLUMN "original_amount" DECIMAL(14, 2),
  ADD COLUMN "corrected_amount" DECIMAL(14, 2),
  ADD COLUMN "delta_amount" DECIMAL(14, 2);
