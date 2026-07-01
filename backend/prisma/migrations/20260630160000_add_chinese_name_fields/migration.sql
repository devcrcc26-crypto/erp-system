-- Part 1: English name stays in `name`; Chinese name is optional in `name_zh`.

UPDATE "project"
SET "name" = COALESCE(NULLIF(TRIM("name"), ''), "name_en")
WHERE "name_en" IS NOT NULL;

UPDATE "task"
SET "name" = COALESCE(NULLIF(TRIM("name"), ''), "name_en")
WHERE "name_en" IS NOT NULL;

ALTER TABLE "project" DROP COLUMN "name_en";
ALTER TABLE "task" DROP COLUMN "name_en";

ALTER TABLE "project" ALTER COLUMN "name_zh" DROP NOT NULL;
ALTER TABLE "task" ALTER COLUMN "name_zh" DROP NOT NULL;
