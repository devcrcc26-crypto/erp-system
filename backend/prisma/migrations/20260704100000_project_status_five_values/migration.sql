-- Migrate ProjectStatus from 7 legacy values to exactly 5 canonical values.
-- Safe for production: data is remapped before the enum type is replaced.

CREATE TYPE "ProjectStatus_new" AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'ON_HOLD',
  'CANCELLED',
  'COMPLETED'
);

ALTER TABLE "project" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "project" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

UPDATE "project"
SET "status" = 'NOT_STARTED'
WHERE "status" IN ('PLANNING', 'TENDER');

UPDATE "project"
SET "status" = 'IN_PROGRESS'
WHERE "status" IN ('MOBILIZATION', 'ACTIVE');

UPDATE "project"
SET "status" = 'ON_HOLD'
WHERE "status" = 'ON_HOLD';

UPDATE "project"
SET "status" = 'COMPLETED'
WHERE "status" IN ('COMPLETED', 'CLOSED');

ALTER TABLE "project"
  ALTER COLUMN "status" TYPE "ProjectStatus_new"
  USING "status"::"ProjectStatus_new";

ALTER TABLE "project" ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED';

DROP TYPE "ProjectStatus";
ALTER TYPE "ProjectStatus_new" RENAME TO "ProjectStatus";
