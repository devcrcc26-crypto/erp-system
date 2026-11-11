-- Shrink IssueStatus to OPEN / IN_PROGRESS / CLOSED

UPDATE issue
SET status = 'IN_PROGRESS'
WHERE status::text = 'RESOLVED'
  AND deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'IssueStatus'
      AND e.enumlabel = 'RESOLVED'
  ) THEN
    ALTER TYPE "IssueStatus" RENAME TO "IssueStatus_old";

    CREATE TYPE "IssueStatus" AS ENUM (
      'OPEN',
      'IN_PROGRESS',
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
