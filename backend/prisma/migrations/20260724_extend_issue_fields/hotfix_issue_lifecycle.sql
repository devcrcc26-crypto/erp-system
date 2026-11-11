-- Idempotent hotfix for issue lifecycle columns + enum (Supabase / prod).

ALTER TABLE issue
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;

ALTER TABLE issue
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP;

ALTER TABLE issue
  ADD COLUMN IF NOT EXISTS reopened_by TEXT;

CREATE TABLE IF NOT EXISTS issue_response (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issue(id),
  response_text TEXT NOT NULL,
  responded_by TEXT NOT NULL REFERENCES "user"(id),
  responded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  response_document_id TEXT REFERENCES document(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_response_issue_id
  ON issue_response(issue_id);

CREATE INDEX IF NOT EXISTS idx_issue_response_response_document_id
  ON issue_response(response_document_id);

-- Remap legacy statuses before enum shrink
UPDATE issue
SET status = 'IN_PROGRESS'
WHERE status::text = 'ASSIGNED'
  AND deleted_at IS NULL;

UPDATE issue
SET status = 'RESOLVED'
WHERE status::text = 'VERIFIED'
  AND deleted_at IS NULL;

-- Recreate IssueStatus without ASSIGNED / VERIFIED (skip if already done)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'IssueStatus'
      AND e.enumlabel IN ('ASSIGNED', 'VERIFIED')
  ) THEN
    ALTER TYPE "IssueStatus" RENAME TO "IssueStatus_old";

    CREATE TYPE "IssueStatus" AS ENUM (
      'OPEN',
      'IN_PROGRESS',
      'RESOLVED',
      'CLOSED'
    );

    ALTER TABLE issue
      ALTER COLUMN status DROP DEFAULT;

    ALTER TABLE issue
      ALTER COLUMN status TYPE "IssueStatus"
      USING status::text::"IssueStatus";

    ALTER TABLE issue
      ALTER COLUMN status SET DEFAULT 'OPEN'::"IssueStatus";

    DROP TYPE "IssueStatus_old";
  END IF;
END $$;
