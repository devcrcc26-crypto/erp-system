-- AlterTable
ALTER TABLE "issue"
  ADD COLUMN "company_id" TEXT,
  ADD COLUMN "resolved_by" TEXT,
  ADD COLUMN "verified_by" TEXT;

-- Backfill company_id from project
UPDATE "issue" i
SET "company_id" = p."company_id"
FROM "project" p
WHERE p."id" = i."project_id";

ALTER TABLE "issue"
  ALTER COLUMN "company_id" SET NOT NULL;

-- Indexes
CREATE INDEX "idx_issue_company_id" ON "issue"("company_id");
CREATE INDEX "idx_issue_company_deleted" ON "issue"("company_id", "deleted_at");

-- ForeignKeys
ALTER TABLE "issue"
  ADD CONSTRAINT "issue_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "issue"
  ADD CONSTRAINT "issue_resolved_by_fkey"
  FOREIGN KEY ("resolved_by") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "issue"
  ADD CONSTRAINT "issue_verified_by_fkey"
  FOREIGN KEY ("verified_by") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
