-- Add bilingual name columns and backfill from legacy `name` field.

ALTER TABLE "project" ADD COLUMN "name_en" TEXT;
ALTER TABLE "project" ADD COLUMN "name_zh" TEXT;

UPDATE "project"
SET "name_en" = "name",
    "name_zh" = "name"
WHERE "name_en" IS NULL OR "name_zh" IS NULL;

ALTER TABLE "project" ALTER COLUMN "name_en" SET NOT NULL;
ALTER TABLE "project" ALTER COLUMN "name_zh" SET NOT NULL;

ALTER TABLE "task" ADD COLUMN "name_en" TEXT;
ALTER TABLE "task" ADD COLUMN "name_zh" TEXT;

UPDATE "task"
SET "name_en" = "name",
    "name_zh" = "name"
WHERE "name_en" IS NULL OR "name_zh" IS NULL;

ALTER TABLE "task" ALTER COLUMN "name_en" SET NOT NULL;
ALTER TABLE "task" ALTER COLUMN "name_zh" SET NOT NULL;
