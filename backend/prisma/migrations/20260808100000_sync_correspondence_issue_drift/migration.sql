-- Catch-up: record schema already present on drifted DBs (correspondence + IssueStatus).
-- Safe/idempotent so clean DBs that only ran prior migrations can apply this too.
-- On the current Supabase DB this should be marked applied via:
--   npx prisma migrate resolve --applied 20260808100000_sync_correspondence_issue_drift

-- A. CorrespondenceDirection + columns / indexes / FKs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CorrespondenceDirection') THEN
    CREATE TYPE "CorrespondenceDirection" AS ENUM ('INCOMING', 'OUTGOING');
  END IF;
END $$;

ALTER TABLE "correspondence"
  ADD COLUMN IF NOT EXISTS "company_id" TEXT,
  ADD COLUMN IF NOT EXISTS "direction" "CorrespondenceDirection" DEFAULT 'OUTGOING',
  ADD COLUMN IF NOT EXISTS "sender_company" TEXT,
  ADD COLUMN IF NOT EXISTS "recipient_company" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "parent_correspondence_id" TEXT,
  ADD COLUMN IF NOT EXISTS "sent_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acknowledged_by" TEXT;

-- Backfill company_id from project when missing
UPDATE "correspondence" c
SET "company_id" = p."company_id"
FROM "project" p
WHERE c."company_id" IS NULL
  AND p."id" = c."project_id";

UPDATE "correspondence"
SET "direction" = 'OUTGOING'
WHERE "direction" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'correspondence' AND column_name = 'company_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'correspondence'
      AND column_name = 'company_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "correspondence" ALTER COLUMN "company_id" SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'correspondence' AND column_name = 'direction'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'correspondence'
      AND column_name = 'direction'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "correspondence" ALTER COLUMN "direction" SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_correspondence_company_id"
  ON "correspondence"("company_id");
CREATE INDEX IF NOT EXISTS "idx_correspondence_company_deleted"
  ON "correspondence"("company_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "idx_correspondence_parent_id"
  ON "correspondence"("parent_correspondence_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'correspondence_company_id_fkey'
  ) THEN
    ALTER TABLE "correspondence"
      ADD CONSTRAINT "correspondence_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "company"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'correspondence_acknowledged_by_fkey'
  ) THEN
    ALTER TABLE "correspondence"
      ADD CONSTRAINT "correspondence_acknowledged_by_fkey"
      FOREIGN KEY ("acknowledged_by") REFERENCES "user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'correspondence_parent_correspondence_id_fkey'
  ) THEN
    ALTER TABLE "correspondence"
      ADD CONSTRAINT "correspondence_parent_correspondence_id_fkey"
      FOREIGN KEY ("parent_correspondence_id") REFERENCES "correspondence"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- B. Shrink IssueStatus to OPEN / IN_PROGRESS / CLOSED (hotfix already on some DBs)
UPDATE "issue"
SET "status" = 'IN_PROGRESS'
WHERE "status"::text = 'RESOLVED'
  AND "deleted_at" IS NULL;

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

    ALTER TABLE "issue" ALTER COLUMN "status" DROP DEFAULT;

    ALTER TABLE "issue"
      ALTER COLUMN "status" TYPE "IssueStatus"
      USING "status"::text::"IssueStatus";

    ALTER TABLE "issue"
      ALTER COLUMN "status" SET DEFAULT 'OPEN'::"IssueStatus";

    DROP TYPE "IssueStatus_old";
  END IF;
END $$;
