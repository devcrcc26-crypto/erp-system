-- PHASE 1: Extend department table, seed PM departments, link projects
-- Rollback note:
--   UPDATE project SET department_id = NULL;
--   ALTER TABLE project DROP COLUMN IF EXISTS department_id;
--   DELETE FROM department WHERE code IN ('MTD', 'ADD');
--   ALTER TABLE department DROP COLUMN IF EXISTS leader_user_id;
--   ALTER TABLE department DROP COLUMN IF EXISTS name_zh;

-- Affected: department +2 columns (all rows), +2 new department rows, project +1 column, UPDATE 19 project rows
-- NOTE: All PK/FK ids in this database are TEXT (not native UUID).

ALTER TABLE "department"
  ADD COLUMN IF NOT EXISTS "name_zh" TEXT;

-- Recover from failed attempt that may have created leader_user_id as UUID
ALTER TABLE "department" DROP CONSTRAINT IF EXISTS "department_leader_user_id_fkey";
ALTER TABLE "department" DROP COLUMN IF EXISTS "leader_user_id";

ALTER TABLE "department"
  ADD COLUMN "leader_user_id" TEXT;

ALTER TABLE "department"
  ADD CONSTRAINT "department_leader_user_id_fkey"
  FOREIGN KEY ("leader_user_id") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_department_leader_user_id"
  ON "department"("leader_user_id");

-- Seed Municipal Transportation + Architectural Design departments
-- Only when seed company/division/branch already exist (skip on empty local DBs).
INSERT INTO "department" (
  "id",
  "company_id",
  "division_id",
  "branch_id",
  "name",
  "name_zh",
  "code",
  "is_active",
  "leader_user_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by"
)
SELECT
  v."id",
  v."company_id",
  v."division_id",
  v."branch_id",
  v."name",
  v."name_zh",
  v."code",
  v."is_active",
  v."leader_user_id",
  v."created_at",
  v."created_by",
  v."updated_at",
  v."updated_by"
FROM (
  VALUES
    (
      'e0000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      '359e3881-0f8b-488b-87cd-4a854a0b1d11',
      '00000000-0000-4000-8000-000000000010',
      'Municipal Transportation Department',
      '市政交通部',
      'MTD',
      true,
      NULL::text,
      NOW(),
      '00000000-0000-4000-8000-000000000001',
      NOW(),
      '00000000-0000-4000-8000-000000000001'
    ),
    (
      'e0000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
      '359e3881-0f8b-488b-87cd-4a854a0b1d11',
      '00000000-0000-4000-8000-000000000010',
      'Architectural Design Department',
      '建筑设计部',
      'ADD',
      true,
      NULL::text,
      NOW(),
      '00000000-0000-4000-8000-000000000001',
      NOW(),
      '00000000-0000-4000-8000-000000000001'
    )
) AS v(
  "id",
  "company_id",
  "division_id",
  "branch_id",
  "name",
  "name_zh",
  "code",
  "is_active",
  "leader_user_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by"
)
WHERE EXISTS (
  SELECT 1 FROM "company" c WHERE c."id" = '00000000-0000-4000-8000-000000000001'
)
AND EXISTS (
  SELECT 1 FROM "division" d WHERE d."id" = '359e3881-0f8b-488b-87cd-4a854a0b1d11'
)
AND EXISTS (
  SELECT 1 FROM "branch" b WHERE b."id" = '00000000-0000-4000-8000-000000000010'
)
ON CONFLICT ("company_id", "code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "name_zh" = EXCLUDED."name_zh",
  "updated_at" = NOW();

ALTER TABLE "project" DROP CONSTRAINT IF EXISTS "project_department_id_fkey";
ALTER TABLE "project" DROP COLUMN IF EXISTS "department_id";

ALTER TABLE "project"
  ADD COLUMN "department_id" TEXT;

ALTER TABLE "project"
  ADD CONSTRAINT "project_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "department"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_project_department_id"
  ON "project"("department_id");

-- Migrate enum -> FK (19 rows: all MUNICIPAL_TRANSPORTATION_DEPARTMENT today)
UPDATE "project"
SET "department_id" = 'e0000000-0000-4000-8000-000000000001'
WHERE "deleted_at" IS NULL
  AND "responsible_department" = 'MUNICIPAL_TRANSPORTATION_DEPARTMENT';

UPDATE "project"
SET "department_id" = 'e0000000-0000-4000-8000-000000000002'
WHERE "deleted_at" IS NULL
  AND "responsible_department" = 'ARCHITECTURAL_DESIGN_DEPARTMENT';
