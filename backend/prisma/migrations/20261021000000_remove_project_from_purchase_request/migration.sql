-- Remove project link from purchase_request table
ALTER TABLE "purchase_request" DROP COLUMN IF EXISTS "project_id";
DROP INDEX IF EXISTS "idx_purchase_request_project";
