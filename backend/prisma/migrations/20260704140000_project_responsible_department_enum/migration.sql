-- Replace project.responsible_department_id (UUID FK) with ProjectResponsibleDepartment enum.
-- Proposed mapping - confirm before deploying to live database.

ALTER TABLE "project" ADD COLUMN "responsible_department_tmp" TEXT;

UPDATE "project" AS p
SET "responsible_department_tmp" = 'ARCHITECTURAL_DESIGN_DEPARTMENT'
FROM "department" AS d
WHERE p."responsible_department_id" = d.id
  AND (
    LOWER(d.name) LIKE '%architect%'
    OR (
      LOWER(d.name) LIKE '%design%'
      AND LOWER(d.name) NOT LIKE '%transport%'
    )
  );

UPDATE "project" AS p
SET "responsible_department_tmp" = 'MUNICIPAL_TRANSPORTATION_DEPARTMENT'
FROM "department" AS d
WHERE p."responsible_department_id" = d.id
  AND p."responsible_department_tmp" IS NULL
  AND (
    LOWER(d.name) LIKE '%transport%'
    OR LOWER(d.name) LIKE '%municipal%'
    OR LOWER(d.name) LIKE '%transit%'
    OR LOWER(d.name) LIKE '%rail%'
  );

UPDATE "project"
SET "responsible_department_tmp" = 'MUNICIPAL_TRANSPORTATION_DEPARTMENT'
WHERE "responsible_department_tmp" IS NULL;

ALTER TABLE "project" DROP CONSTRAINT IF EXISTS "project_responsible_department_id_fkey";

DROP INDEX IF EXISTS "idx_project_responsible_department_id";

ALTER TABLE "project" DROP COLUMN IF EXISTS "responsible_department_id";

CREATE TYPE "ProjectResponsibleDepartment" AS ENUM (
  'MUNICIPAL_TRANSPORTATION_DEPARTMENT',
  'ARCHITECTURAL_DESIGN_DEPARTMENT'
);

ALTER TABLE "project"
  RENAME COLUMN "responsible_department_tmp" TO "responsible_department";

ALTER TABLE "project"
  ALTER COLUMN "responsible_department" TYPE "ProjectResponsibleDepartment"
  USING "responsible_department"::"ProjectResponsibleDepartment";

ALTER TABLE "project"
  ALTER COLUMN "responsible_department" SET NOT NULL;

ALTER TABLE "project"
  ALTER COLUMN "responsible_department" SET DEFAULT 'MUNICIPAL_TRANSPORTATION_DEPARTMENT';

CREATE INDEX "idx_project_responsible_department" ON "project"("responsible_department");
