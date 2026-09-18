-- Remove unused project_code from company asset register.
ALTER TABLE "company_asset" DROP COLUMN IF EXISTS "project_code";
