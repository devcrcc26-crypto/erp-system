-- Punch item attribution, company scoping, and workflow fields

ALTER TABLE "punch_item"
  ADD COLUMN IF NOT EXISTS "company_id" TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_note" TEXT,
  ADD COLUMN IF NOT EXISTS "verified_by" TEXT,
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closed_by" TEXT,
  ADD COLUMN IF NOT EXISTS "task_discipline_id" TEXT,
  ADD COLUMN IF NOT EXISTS "design_package_id" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT;

UPDATE "punch_item" pi
SET "company_id" = p."company_id"
FROM "project" p
WHERE p."id" = pi."project_id"
  AND pi."company_id" IS NULL;

ALTER TABLE "punch_item"
  ALTER COLUMN "company_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_punch_item_company_id"
  ON "punch_item"("company_id");
CREATE INDEX IF NOT EXISTS "idx_punch_item_company_deleted"
  ON "punch_item"("company_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "idx_punch_item_verified_by"
  ON "punch_item"("verified_by");
CREATE INDEX IF NOT EXISTS "idx_punch_item_closed_by"
  ON "punch_item"("closed_by");
CREATE INDEX IF NOT EXISTS "idx_punch_item_task_discipline_id"
  ON "punch_item"("task_discipline_id");
CREATE INDEX IF NOT EXISTS "idx_punch_item_design_package_id"
  ON "punch_item"("design_package_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'punch_item_company_id_fkey'
  ) THEN
    ALTER TABLE "punch_item"
      ADD CONSTRAINT "punch_item_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "company"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'punch_item_verified_by_fkey'
  ) THEN
    ALTER TABLE "punch_item"
      ADD CONSTRAINT "punch_item_verified_by_fkey"
      FOREIGN KEY ("verified_by") REFERENCES "user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'punch_item_closed_by_fkey'
  ) THEN
    ALTER TABLE "punch_item"
      ADD CONSTRAINT "punch_item_closed_by_fkey"
      FOREIGN KEY ("closed_by") REFERENCES "user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'punch_item_task_discipline_id_fkey'
  ) THEN
    ALTER TABLE "punch_item"
      ADD CONSTRAINT "punch_item_task_discipline_id_fkey"
      FOREIGN KEY ("task_discipline_id") REFERENCES "task_discipline"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'punch_item_design_package_id_fkey'
  ) THEN
    ALTER TABLE "punch_item"
      ADD CONSTRAINT "punch_item_design_package_id_fkey"
      FOREIGN KEY ("design_package_id") REFERENCES "design_package"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
