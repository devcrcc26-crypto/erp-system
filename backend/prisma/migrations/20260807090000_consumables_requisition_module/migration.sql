-- AlterEnum
ALTER TYPE "FolderContextType" ADD VALUE 'CONSUMABLES_REQUISITION';

-- CreateEnum
CREATE TYPE "ConsumablesRequisitionStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'IN_REVIEW',
  'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'
);

-- CreateTable
CREATE TABLE "consumables_requisition" (
  "id"                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"             TEXT NOT NULL REFERENCES "company"("id"),
  "request_number"         TEXT NOT NULL,
  "employee_id"            TEXT NOT NULL REFERENCES "user"("id"),
  "title"                  TEXT NOT NULL,
  "purpose"                TEXT NOT NULL,
  "required_by_date"       DATE,
  "department"             TEXT,
  "declaration_confirmed"  BOOLEAN NOT NULL DEFAULT false,
  "status"                 "ConsumablesRequisitionStatus" NOT NULL DEFAULT 'DRAFT',
  "approval_request_id"    TEXT UNIQUE REFERENCES "approval_request"("id"),
  "attachment_folder_id"   TEXT REFERENCES "document_folder"("id"),
  "submitted_at"           TIMESTAMP(3),
  "completed_at"           TIMESTAMP(3),
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"             TEXT NOT NULL REFERENCES "user"("id"),
  "updated_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"             TEXT NOT NULL REFERENCES "user"("id"),
  "deleted_at"             TIMESTAMP(3),
  "deleted_by"             TEXT,
  UNIQUE ("company_id", "request_number")
);

CREATE SEQUENCE "consumables_requisition_number_seq";

CREATE TABLE "consumables_requisition_item" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "requisition_id"  TEXT NOT NULL REFERENCES "consumables_requisition"("id") ON DELETE CASCADE,
  "item_name"       TEXT NOT NULL,
  "item_code"       TEXT,
  "description"     TEXT,
  "quantity"        NUMERIC(10,2) NOT NULL,
  "unit"            TEXT NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_consumables_req_company" ON "consumables_requisition"("company_id");
CREATE INDEX "idx_consumables_req_employee" ON "consumables_requisition"("employee_id");
CREATE INDEX "idx_consumables_req_status" ON "consumables_requisition"("status");
CREATE INDEX "idx_consumables_req_company_deleted" ON "consumables_requisition"("company_id", "deleted_at");
CREATE INDEX "idx_consumables_req_attachment_folder" ON "consumables_requisition"("attachment_folder_id");
CREATE INDEX "idx_consumables_req_item" ON "consumables_requisition_item"("requisition_id");
