-- Add file_name to official and project seal requests (short label for list/table display).

ALTER TABLE "official_seal" ADD COLUMN "file_name" TEXT;

UPDATE "official_seal"
SET "file_name" = LEFT("description", 255)
WHERE "file_name" IS NULL;

ALTER TABLE "official_seal" ALTER COLUMN "file_name" SET NOT NULL;

ALTER TABLE "project_seal" ADD COLUMN "file_name" TEXT;

UPDATE "project_seal"
SET "file_name" = LEFT("description", 255)
WHERE "file_name" IS NULL;

ALTER TABLE "project_seal" ALTER COLUMN "file_name" SET NOT NULL;
