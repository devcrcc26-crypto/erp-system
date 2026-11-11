-- User: opt-out of payroll generation
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "include_in_payroll" BOOLEAN NOT NULL DEFAULT true;

-- Exclude system/test accounts from payroll by default
UPDATE "user"
SET "include_in_payroll" = false
WHERE "deleted_at" IS NULL
  AND (
    ("first_name" ILIKE 'System' AND "last_name" ILIKE 'Administrator')
    OR "employee_id" = 'EM-105'
    OR "email" ILIKE 'admin@%'
  );

-- PayrollEntry: half-day scheduledDays + employed window visibility
ALTER TABLE "payroll_entry"
  ALTER COLUMN "scheduled_days" TYPE DECIMAL(5, 2)
  USING "scheduled_days"::DECIMAL(5, 2);

ALTER TABLE "payroll_entry"
  ADD COLUMN IF NOT EXISTS "employed_days" DECIMAL(5, 2) NOT NULL DEFAULT 0;
