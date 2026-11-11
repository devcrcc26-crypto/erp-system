-- AlterEnum
ALTER TYPE "FolderContextType" ADD VALUE 'PURCHASE_REQUEST';

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'IN_REVIEW',
  'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'
);

-- CreateTable
CREATE TABLE "purchase_request" (
  "id"                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"            TEXT NOT NULL REFERENCES "company"("id"),
  "request_number"        TEXT NOT NULL,
  "employee_id"           TEXT NOT NULL REFERENCES "user"("id"),
  "title"                 TEXT NOT NULL,
  "justification"         TEXT NOT NULL,
  "vendor_name"           TEXT,
  "vendor_contact"        TEXT,
  "required_by_date"      DATE,
  "project_id"            TEXT REFERENCES "project"("id"),
  "total_estimated_cost"  NUMERIC(14,2) NOT NULL DEFAULT 0,
  "currency"              "SupportedCurrency" NOT NULL DEFAULT 'ETB',
  "total_estimated_etb"   NUMERIC(14,2) NOT NULL DEFAULT 0,
  "status"                "PurchaseRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "approval_request_id"   TEXT UNIQUE REFERENCES "approval_request"("id"),
  "attachment_folder_id"  TEXT REFERENCES "document_folder"("id"),
  "submitted_at"          TIMESTAMP(3),
  "completed_at"          TIMESTAMP(3),
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"            TEXT NOT NULL REFERENCES "user"("id"),
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"            TEXT NOT NULL REFERENCES "user"("id"),
  "deleted_at"            TIMESTAMP(3),
  "deleted_by"            TEXT,
  UNIQUE ("company_id", "request_number")
);

CREATE SEQUENCE "purchase_request_number_seq";

CREATE TABLE "purchase_request_item" (
  "id"               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "request_id"       TEXT NOT NULL REFERENCES "purchase_request"("id") ON DELETE CASCADE,
  "item_name"        TEXT NOT NULL,
  "description"      TEXT,
  "quantity"         NUMERIC(10,2) NOT NULL,
  "unit"             TEXT NOT NULL,
  "unit_price"       NUMERIC(14,2) NOT NULL,
  "currency"         "SupportedCurrency" NOT NULL DEFAULT 'ETB',
  "total_price"      NUMERIC(14,2) NOT NULL,
  "total_price_etb"  NUMERIC(14,2) NOT NULL,
  "exchange_rate"    NUMERIC(18,6) NOT NULL DEFAULT 1,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_purchase_request_company" ON "purchase_request"("company_id");
CREATE INDEX "idx_purchase_request_employee" ON "purchase_request"("employee_id");
CREATE INDEX "idx_purchase_request_status" ON "purchase_request"("status");
CREATE INDEX "idx_purchase_request_company_deleted" ON "purchase_request"("company_id", "deleted_at");
CREATE INDEX "idx_purchase_request_project" ON "purchase_request"("project_id");
CREATE INDEX "idx_purchase_request_item_request" ON "purchase_request_item"("request_id");
CREATE INDEX "idx_purchase_request_attachment_folder" ON "purchase_request"("attachment_folder_id");
