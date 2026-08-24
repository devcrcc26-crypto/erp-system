-- Align Inspection & Repair with assigned company assets and simplified status lifecycle.

ALTER TABLE "inspection_repair"
  ADD COLUMN IF NOT EXISTS "asset_id" TEXT;

ALTER TABLE "inspection_repair"
  ALTER COLUMN "make" DROP NOT NULL,
  ALTER COLUMN "model" DROP NOT NULL,
  ALTER COLUMN "year" DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'InspectionRepairStatus' AND e.enumlabel = 'APPROVED'
  ) THEN
    UPDATE "inspection_repair"
    SET "status" = 'IN_REPAIR'
    WHERE "status" = 'APPROVED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'InspectionRepairStatus' AND e.enumlabel = 'RETURNED'
  ) THEN
    UPDATE "inspection_repair"
    SET "status" = 'REJECTED'
    WHERE "status" = 'RETURNED';
  END IF;
END $$;

ALTER TYPE "InspectionRepairStatus" RENAME TO "InspectionRepairStatus_old";
CREATE TYPE "InspectionRepairStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'IN_REPAIR',
  'REPAIRED',
  'REJECTED'
);

ALTER TABLE "inspection_repair"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "InspectionRepairStatus"
  USING ("status"::text::"InspectionRepairStatus"),
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "InspectionRepairStatus_old";

CREATE INDEX IF NOT EXISTS "idx_inspection_repair_asset"
  ON "inspection_repair"("asset_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspection_repair_asset_id_fkey'
  ) THEN
    ALTER TABLE "inspection_repair"
      ADD CONSTRAINT "inspection_repair_asset_id_fkey"
      FOREIGN KEY ("asset_id") REFERENCES "company_asset"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
