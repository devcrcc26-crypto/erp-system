-- Backfill responsible person from project manager where not already set.
UPDATE "project"
SET "responsible_person_id" = "project_manager_id"
WHERE "project_manager_id" IS NOT NULL
  AND "responsible_person_id" IS NULL;

ALTER TABLE "project" DROP CONSTRAINT IF EXISTS "project_project_manager_id_fkey";

DROP INDEX IF EXISTS "idx_project_manager_id";

ALTER TABLE "project" DROP COLUMN IF EXISTS "project_manager_id";

ALTER TABLE "project" DROP COLUMN IF EXISTS "commissioning_method";
