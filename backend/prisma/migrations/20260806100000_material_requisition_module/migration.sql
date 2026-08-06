-- AlterEnum
ALTER TYPE "FolderContextType" ADD VALUE 'MATERIAL_REQUISITION';

-- CreateEnum
CREATE TYPE "MaterialRequisitionStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'IN_REVIEW',
  'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'
);

-- CreateTable
CREATE TABLE "material_requisition" (
  "id"                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"            TEXT NOT NULL REFERENCES "company"("id"),
  "request_number"        TEXT NOT NULL,
  "employee_id"           TEXT NOT NULL REFERENCES "user"("id"),
  "title"                 TEXT NOT NULL,
  "purpose"               TEXT NOT NULL,
  "required_by_date"      DATE,
  "project_id"            TEXT REFERENCES "project"("id"),
  "warehouse_location"    TEXT,
  "status"                "MaterialRequisitionStatus" NOT NULL DEFAULT 'DRAFT',
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

CREATE SEQUENCE "material_requisition_number_seq";

CREATE TABLE "material_requisition_item" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "requisition_id"  TEXT NOT NULL REFERENCES "material_requisition"("id") ON DELETE CASCADE,
  "item_name"       TEXT NOT NULL,
  "item_code"       TEXT,
  "description"     TEXT,
  "quantity"        NUMERIC(10,2) NOT NULL,
  "unit"            TEXT NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_material_requisition_company" ON "material_requisition"("company_id");
CREATE INDEX "idx_material_requisition_employee" ON "material_requisition"("employee_id");
CREATE INDEX "idx_material_requisition_status" ON "material_requisition"("status");
CREATE INDEX "idx_material_requisition_company_deleted" ON "material_requisition"("company_id", "deleted_at");
CREATE INDEX "idx_material_requisition_project" ON "material_requisition"("project_id");
CREATE INDEX "idx_material_requisition_attachment_folder" ON "material_requisition"("attachment_folder_id");
CREATE INDEX "idx_material_requisition_item" ON "material_requisition_item"("requisition_id");
