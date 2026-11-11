-- Align leftover issue drift with schema.prisma, then add Inspection Repair module.
-- This migration is meant to RUN (prisma migrate deploy), not only resolve.

-- A. Drop obsolete issue verification columns left on drifted DBs
ALTER TABLE "issue" DROP CONSTRAINT IF EXISTS "issue_verified_by_fkey";
ALTER TABLE "issue" DROP COLUMN IF EXISTS "verified_at";
ALTER TABLE "issue" DROP COLUMN IF EXISTS "verified_by";

-- Restore reopened_by FK if missing (present in schema / original migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issue_reopened_by_fkey'
  ) THEN
    ALTER TABLE "issue"
      ADD CONSTRAINT "issue_reopened_by_fkey"
      FOREIGN KEY ("reopened_by") REFERENCES "user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Normalize timestamp precision where hotfixes used TIMESTAMP without (3)
ALTER TABLE "issue"
  ALTER COLUMN "reopened_at" TYPE TIMESTAMP(3)
  USING "reopened_at"::TIMESTAMP(3);

ALTER TABLE "issue_response"
  ALTER COLUMN "responded_at" TYPE TIMESTAMP(3)
  USING "responded_at"::TIMESTAMP(3),
  ALTER COLUMN "created_at" TYPE TIMESTAMP(3)
  USING "created_at"::TIMESTAMP(3);

-- B. Inspection Repair
ALTER TYPE "FolderContextType" ADD VALUE 'INSPECTION_REPAIR';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InspectionRepairUrgency') THEN
    CREATE TYPE "InspectionRepairUrgency" AS ENUM (
      'CRITICALLY', 'URGENT', 'MEDIUM', 'MINOR'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InspectionRepairStatus') THEN
    CREATE TYPE "InspectionRepairStatus" AS ENUM (
      'DRAFT', 'SUBMITTED', 'IN_REPAIR',
      'APPROVED', 'REPAIRED', 'RETURNED', 'REJECTED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InspectionRepairType') THEN
    CREATE TYPE "InspectionRepairType" AS ENUM (
      'INSPECTION', 'MAINTENANCE', 'REPAIR'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "inspection_repair" (
  "id"                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"               TEXT NOT NULL,
  "employee_id"              TEXT NOT NULL,
  "location"                 TEXT NOT NULL,
  "device_name"              TEXT NOT NULL,
  "description"              TEXT NOT NULL,
  "make"                     TEXT NOT NULL,
  "model"                    TEXT NOT NULL,
  "year"                     INTEGER NOT NULL,
  "urgency"                  "InspectionRepairUrgency" NOT NULL DEFAULT 'MINOR',
  "solution"                 TEXT,
  "inspection_repair_number" TEXT NOT NULL,
  "approval_request_id"      TEXT,
  "attachment_folder_id"     TEXT,
  "inspection_type"          "InspectionRepairType" NOT NULL,
  "status"                   "InspectionRepairStatus" NOT NULL DEFAULT 'DRAFT',
  "submitted_at"             TIMESTAMP(3),
  "completed_at"             TIMESTAMP(3),
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"               TEXT NOT NULL,
  "updated_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"               TEXT NOT NULL,
  "deleted_at"               TIMESTAMP(3),
  "deleted_by"               TEXT
);

CREATE SEQUENCE IF NOT EXISTS "inspection_repair_number_seq";

CREATE UNIQUE INDEX IF NOT EXISTS "inspection_repair_approval_request_id_key"
  ON "inspection_repair"("approval_request_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_inspection_repair_company_number"
  ON "inspection_repair"("company_id", "inspection_repair_number");
CREATE INDEX IF NOT EXISTS "idx_inspection_repair_company"
  ON "inspection_repair"("company_id");
CREATE INDEX IF NOT EXISTS "idx_inspection_repair_employee"
  ON "inspection_repair"("employee_id");
CREATE INDEX IF NOT EXISTS "idx_inspection_repair_status"
  ON "inspection_repair"("status");
CREATE INDEX IF NOT EXISTS "idx_inspection_repair_deleted"
  ON "inspection_repair"("company_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "idx_inspection_repair_attachment_folder"
  ON "inspection_repair"("attachment_folder_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspection_repair_company_id_fkey'
  ) THEN
    ALTER TABLE "inspection_repair"
      ADD CONSTRAINT "inspection_repair_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "company"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspection_repair_employee_id_fkey'
  ) THEN
    ALTER TABLE "inspection_repair"
      ADD CONSTRAINT "inspection_repair_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "user"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspection_repair_approval_request_id_fkey'
  ) THEN
    ALTER TABLE "inspection_repair"
      ADD CONSTRAINT "inspection_repair_approval_request_id_fkey"
      FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspection_repair_attachment_folder_id_fkey'
  ) THEN
    ALTER TABLE "inspection_repair"
      ADD CONSTRAINT "inspection_repair_attachment_folder_id_fkey"
      FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspection_repair_created_by_fkey'
  ) THEN
    ALTER TABLE "inspection_repair"
      ADD CONSTRAINT "inspection_repair_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "user"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
