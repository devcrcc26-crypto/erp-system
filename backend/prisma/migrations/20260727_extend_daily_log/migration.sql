-- Extend daily_log with company scoping, numbering, supervisor, and narrative fields.

ALTER TABLE "daily_log"
  ADD COLUMN IF NOT EXISTS "company_id" TEXT,
  ADD COLUMN IF NOT EXISTS "log_number" TEXT,
  ADD COLUMN IF NOT EXISTS "workforce_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "contractor_name" TEXT,
  ADD COLUMN IF NOT EXISTS "supervisor_id" TEXT,
  ADD COLUMN IF NOT EXISTS "supervised_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "humidity" DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS "issues" TEXT,
  ADD COLUMN IF NOT EXISTS "delays" TEXT,
  ADD COLUMN IF NOT EXISTS "equipment" TEXT,
  ADD COLUMN IF NOT EXISTS "materials" TEXT;

UPDATE "daily_log" dl
SET "company_id" = p."company_id"
FROM "project" p
WHERE p."id" = dl."project_id"
  AND dl."company_id" IS NULL;

ALTER TABLE "daily_log"
  ALTER COLUMN "company_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_daily_log_company_id" ON "daily_log"("company_id");
CREATE INDEX IF NOT EXISTS "idx_daily_log_company_deleted" ON "daily_log"("company_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "idx_daily_log_supervisor_id" ON "daily_log"("supervisor_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_log_company_id_fkey'
  ) THEN
    ALTER TABLE "daily_log"
      ADD CONSTRAINT "daily_log_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "company"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_log_supervisor_id_fkey'
  ) THEN
    ALTER TABLE "daily_log"
      ADD CONSTRAINT "daily_log_supervisor_id_fkey"
      FOREIGN KEY ("supervisor_id") REFERENCES "user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
