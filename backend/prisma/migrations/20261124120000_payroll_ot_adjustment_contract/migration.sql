-- Manual OT adjustments are priced per salary-period contract (not always month-end).

-- Add contract_id (nullable first for backfill)
ALTER TABLE "payroll_ot_adjustment" ADD COLUMN "contract_id" TEXT;

-- Prefer the payroll entry's month-end contract; else the latest salary period on that entry
UPDATE "payroll_ot_adjustment" AS a
SET "contract_id" = COALESCE(
  (
    SELECT e."contract_id"
    FROM "payroll_entry" e
    WHERE e."run_id" = a."payroll_run_id"
      AND e."employee_id" = a."employee_id"
      AND e."company_id" = a."company_id"
    LIMIT 1
  ),
  (
    SELECT sp."contract_id"
    FROM "payroll_salary_period" sp
    INNER JOIN "payroll_entry" e ON e."id" = sp."entry_id"
    WHERE e."run_id" = a."payroll_run_id"
      AND e."employee_id" = a."employee_id"
      AND e."company_id" = a."company_id"
    ORDER BY sp."period_end" DESC
    LIMIT 1
  )
);

-- Drop rows that still have no contract (cannot price without one)
DELETE FROM "payroll_ot_adjustment" WHERE "contract_id" IS NULL;

ALTER TABLE "payroll_ot_adjustment" ALTER COLUMN "contract_id" SET NOT NULL;

DROP INDEX IF EXISTS "uq_payroll_ot_adjustment_run_employee_category";

CREATE UNIQUE INDEX "uq_payroll_ot_adjustment_run_employee_contract_category"
  ON "payroll_ot_adjustment"("payroll_run_id", "employee_id", "contract_id", "ot_category");

CREATE INDEX "idx_payroll_ot_adjustment_contract" ON "payroll_ot_adjustment"("contract_id");

ALTER TABLE "payroll_ot_adjustment"
  ADD CONSTRAINT "payroll_ot_adjustment_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "employee_contract"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
