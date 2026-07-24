-- CreateEnum
CREATE TYPE "RfiSource" AS ENUM (
  'SITE_TEAM',
  'CONTRACTOR',
  'CLIENT_CONSULTANT',
  'INTER_DISCIPLINE'
);

-- AlterTable
ALTER TABLE "rfi"
  ADD COLUMN "company_id" TEXT,
  ADD COLUMN "rfi_source" "RfiSource",
  ADD COLUMN "linked_cr_id" TEXT;

-- Backfill company_id from project
UPDATE "rfi" r
SET "company_id" = p."company_id"
FROM "project" p
WHERE p."id" = r."project_id";

ALTER TABLE "rfi"
  ALTER COLUMN "company_id" SET NOT NULL;

-- Indexes
CREATE INDEX "idx_rfi_company_id" ON "rfi"("company_id");
CREATE INDEX "idx_rfi_company_deleted" ON "rfi"("company_id", "deleted_at");
CREATE INDEX "idx_rfi_linked_cr_id" ON "rfi"("linked_cr_id");

-- ForeignKeys
ALTER TABLE "rfi"
  ADD CONSTRAINT "rfi_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rfi"
  ADD CONSTRAINT "rfi_linked_cr_id_fkey"
  FOREIGN KEY ("linked_cr_id") REFERENCES "project_change_request"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
