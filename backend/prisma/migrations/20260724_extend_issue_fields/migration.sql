-- Extend issue fields, simplify IssueStatus, add issue_response thread.

-- A. New columns
ALTER TABLE "issue"
  ADD COLUMN "company_id" TEXT,
  ADD COLUMN "resolved_by" TEXT,
  ADD COLUMN "resolution_note" TEXT,
  ADD COLUMN "reopened_at" TIMESTAMP(3),
  ADD COLUMN "reopened_by" TEXT;

UPDATE "issue" i
SET "company_id" = p."company_id"
FROM "project" p
WHERE p."id" = i."project_id";

ALTER TABLE "issue"
  ALTER COLUMN "company_id" SET NOT NULL;

CREATE INDEX "idx_issue_company_id" ON "issue"("company_id");
CREATE INDEX "idx_issue_company_deleted" ON "issue"("company_id", "deleted_at");

ALTER TABLE "issue"
  ADD CONSTRAINT "issue_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "issue"
  ADD CONSTRAINT "issue_resolved_by_fkey"
  FOREIGN KEY ("resolved_by") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "issue"
  ADD CONSTRAINT "issue_reopened_by_fkey"
  FOREIGN KEY ("reopened_by") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop obsolete verification timestamp (replaced by raiser close)
ALTER TABLE "issue" DROP COLUMN IF EXISTS "verified_at";
ALTER TABLE "issue" DROP COLUMN IF EXISTS "verified_by";

-- B. Remap legacy statuses, then replace enum
UPDATE "issue"
SET "status" = 'IN_PROGRESS'
WHERE "status"::text = 'ASSIGNED';

UPDATE "issue"
SET "status" = 'RESOLVED'
WHERE "status"::text = 'VERIFIED';

ALTER TYPE "IssueStatus" RENAME TO "IssueStatus_old";

CREATE TYPE "IssueStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED'
);

ALTER TABLE "issue"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "issue"
  ALTER COLUMN "status" TYPE "IssueStatus"
  USING "status"::text::"IssueStatus";

ALTER TABLE "issue"
  ALTER COLUMN "status" SET DEFAULT 'OPEN'::"IssueStatus";

DROP TYPE "IssueStatus_old";

-- C. Response thread
CREATE TABLE "issue_response" (
  "id" TEXT NOT NULL,
  "issue_id" TEXT NOT NULL,
  "response_text" TEXT NOT NULL,
  "responded_by" TEXT NOT NULL,
  "responded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "response_document_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "issue_response_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_issue_response_issue_id" ON "issue_response"("issue_id");
CREATE INDEX "idx_issue_response_response_document_id"
  ON "issue_response"("response_document_id");

ALTER TABLE "issue_response"
  ADD CONSTRAINT "issue_response_issue_id_fkey"
  FOREIGN KEY ("issue_id") REFERENCES "issue"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "issue_response"
  ADD CONSTRAINT "issue_response_responded_by_fkey"
  FOREIGN KEY ("responded_by") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "issue_response"
  ADD CONSTRAINT "issue_response_response_document_id_fkey"
  FOREIGN KEY ("response_document_id") REFERENCES "document"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
