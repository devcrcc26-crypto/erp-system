-- Dedicated company hire date (separate from career experience_start_date).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "employment_date" DATE;

-- Move values the August 2026 contract seed wrote into experience_start_date
-- over to employment_date, then clear experience_start_date (it was empty before
-- that seed for those employees).
UPDATE "user" u
SET
  "employment_date" = u."experience_start_date",
  "experience_start_date" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
WHERE u."experience_start_date" IS NOT NULL
  AND u."deleted_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "employee_contract" c
    WHERE c."employee_id" = u."id"
      AND c."company_id" = u."company_id"
      AND c."notes" = 'Seeded from August 2026 salary sheet - dates derived from employment anniversary.'
  );

CREATE INDEX IF NOT EXISTS "idx_user_company_employment_date"
  ON "user" ("company_id", "employment_date");
