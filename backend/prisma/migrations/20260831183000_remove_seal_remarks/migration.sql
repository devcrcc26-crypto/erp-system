-- Remove unused remarks from seal usage requests.

ALTER TABLE "official_seal" DROP COLUMN IF EXISTS "remarks";
ALTER TABLE "project_seal" DROP COLUMN IF EXISTS "remarks";
