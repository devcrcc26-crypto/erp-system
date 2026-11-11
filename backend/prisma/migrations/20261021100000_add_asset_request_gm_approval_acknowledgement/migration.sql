-- Sequence for asset request numbering
CREATE SEQUENCE IF NOT EXISTS asset_request_number_seq START 1;

-- Add requiresGmApproval to company_asset
ALTER TABLE "company_asset" ADD COLUMN IF NOT EXISTS "requires_gm_approval" BOOLEAN NOT NULL DEFAULT false;

-- Add new fields to asset_assignment
ALTER TABLE "asset_assignment" ADD COLUMN IF NOT EXISTS "approval_request_id" TEXT;
ALTER TABLE "asset_assignment" ADD COLUMN IF NOT EXISTS "employee_acknowledged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "asset_assignment" ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMP(3);
ALTER TABLE "asset_assignment" ADD COLUMN IF NOT EXISTS "asset_request_id" TEXT;

-- Unique constraint on asset_assignment.approval_request_id
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_approval_request_id_key" UNIQUE ("approval_request_id");

-- Create AssetRequestStatus enum
CREATE TYPE "AssetRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'FULFILLED');

-- Create asset_request table
CREATE TABLE "asset_request" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "request_number" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "asset_category" TEXT NOT NULL,
    "asset_type" TEXT,
    "reason" TEXT NOT NULL,
    "required_by_date" DATE,
    "notes" TEXT,
    "status" "AssetRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "approval_request_id" TEXT,
    "fulfilled_by_asset_id" TEXT,
    "attachment_folder_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "asset_request_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_approval_request_id_key" UNIQUE ("approval_request_id");
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_company_id_request_number_key" UNIQUE ("company_id", "request_number");

-- Indexes
CREATE INDEX "idx_asset_request_company" ON "asset_request"("company_id");
CREATE INDEX "idx_asset_request_employee" ON "asset_request"("employee_id");
CREATE INDEX "idx_asset_request_status" ON "asset_request"("status");
CREATE INDEX "idx_asset_request_company_deleted" ON "asset_request"("company_id", "deleted_at");

-- Foreign keys for asset_request
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_fulfilled_by_asset_id_fkey" FOREIGN KEY ("fulfilled_by_asset_id") REFERENCES "company_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_attachment_folder_id_fkey" FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_request" ADD CONSTRAINT "asset_request_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys for asset_assignment new columns
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_asset_request_id_fkey" FOREIGN KEY ("asset_request_id") REFERENCES "asset_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prompt 3: Asset return two-step flow + handover notes
ALTER TABLE "asset_assignment" ADD COLUMN IF NOT EXISTS "return_initiated_by" TEXT;
ALTER TABLE "asset_assignment" ADD COLUMN IF NOT EXISTS "return_initiated_at" TIMESTAMP(3);
ALTER TABLE "asset_assignment" ADD COLUMN IF NOT EXISTS "return_reason" TEXT;
ALTER TABLE "asset_assignment" ADD COLUMN IF NOT EXISTS "handover_notes" TEXT;
ALTER TABLE "asset_assignment" ADD COLUMN IF NOT EXISTS "hr_acknowledged_return" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "asset_assignment" ADD COLUMN IF NOT EXISTS "hr_acknowledged_at" TIMESTAMP(3);
ALTER TABLE "asset_assignment" ADD COLUMN IF NOT EXISTS "hr_acknowledged_by_id" TEXT;

ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_return_initiated_by_fkey" FOREIGN KEY ("return_initiated_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_hr_acknowledged_by_id_fkey" FOREIGN KEY ("hr_acknowledged_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
