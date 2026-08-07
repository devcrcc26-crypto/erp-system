-- AlterEnum
ALTER TYPE "FolderContextType" ADD VALUE 'VEHICLE_REFUELING';

-- CreateEnum: VehicleRefuelingStatus
CREATE TYPE "VehicleRefuelingStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'IN_REVIEW',
  'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'
);

-- CreateTable
CREATE TABLE "vehicle_refueling" (
  "id"                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"           TEXT NOT NULL REFERENCES "company"("id"),
  "request_number"       TEXT NOT NULL,
  "employee_id"          TEXT NOT NULL REFERENCES "user"("id"),
  "vehicle_id"           TEXT NOT NULL REFERENCES "company_vehicle"("id"),
  "driver_id"            TEXT REFERENCES "user"("id"),
  "fuel_date"            DATE NOT NULL,
  "fuel_type"            "FuelType" NOT NULL,
  "fuel_station"         TEXT NOT NULL,
  "current_mileage"      NUMERIC(10,1),
  "requested_litres"     NUMERIC(8,2),
  "estimated_cost_etb"   NUMERIC(12,2),
  "receipt_document_id"  TEXT REFERENCES "document"("id"),
  "notes"                TEXT,
  "status"               "VehicleRefuelingStatus" NOT NULL DEFAULT 'DRAFT',
  "approval_request_id"  TEXT UNIQUE REFERENCES "approval_request"("id"),
  "attachment_folder_id" TEXT REFERENCES "document_folder"("id"),
  "submitted_at"         TIMESTAMP(3),
  "completed_at"         TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"           TEXT NOT NULL REFERENCES "user"("id"),
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"           TEXT NOT NULL,
  "deleted_at"           TIMESTAMP(3),
  "deleted_by"           TEXT,
  UNIQUE ("company_id", "request_number")
);

-- CreateSequence
CREATE SEQUENCE "vehicle_refueling_number_seq";

-- CreateIndexes
CREATE INDEX "idx_vehicle_refueling_company" ON "vehicle_refueling"("company_id");
CREATE INDEX "idx_vehicle_refueling_employee" ON "vehicle_refueling"("employee_id");
CREATE INDEX "idx_vehicle_refueling_vehicle" ON "vehicle_refueling"("vehicle_id");
CREATE INDEX "idx_vehicle_refueling_driver" ON "vehicle_refueling"("driver_id");
CREATE INDEX "idx_vehicle_refueling_status" ON "vehicle_refueling"("status");
CREATE INDEX "idx_vehicle_refueling_company_deleted" ON "vehicle_refueling"("company_id", "deleted_at");
CREATE INDEX "idx_vehicle_refueling_attachment_folder" ON "vehicle_refueling"("attachment_folder_id");
CREATE INDEX "idx_vehicle_refueling_receipt" ON "vehicle_refueling"("receipt_document_id");
