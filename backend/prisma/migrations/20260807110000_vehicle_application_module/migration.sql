-- AlterEnum
ALTER TYPE "FolderContextType" ADD VALUE 'VEHICLE_APPLICATION';

-- CreateEnum: VehicleApplicationStatus
CREATE TYPE "VehicleApplicationStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'IN_REVIEW',
  'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'
);

-- CreateEnum: DriveType
CREATE TYPE "DriveType" AS ENUM (
  'COMPANY_DRIVER', 'SELF_DRIVE'
);

-- CreateTable
CREATE TABLE "vehicle_application" (
  "id"                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"           TEXT NOT NULL REFERENCES "company"("id"),
  "application_number"   TEXT NOT NULL,
  "employee_id"          TEXT NOT NULL REFERENCES "user"("id"),
  "vehicle_id"           TEXT NOT NULL REFERENCES "company_vehicle"("id"),
  "drive_type"           "DriveType" NOT NULL,
  "driver_id"            TEXT REFERENCES "user"("id"),
  "departure_datetime"   TIMESTAMP(3) NOT NULL,
  "return_datetime"      TIMESTAMP(3) NOT NULL,
  "destination"          TEXT NOT NULL,
  "purpose"              TEXT NOT NULL,
  "passenger_count"      INTEGER NOT NULL DEFAULT 1,
  "passenger_names"      TEXT,
  "project_id"           TEXT REFERENCES "project"("id"),
  "notes"                TEXT,
  "status"               "VehicleApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "approval_request_id"  TEXT UNIQUE REFERENCES "approval_request"("id"),
  "attachment_folder_id" TEXT REFERENCES "document_folder"("id"),
  "released_at"          TIMESTAMP(3),
  "released_by"          TEXT REFERENCES "user"("id"),
  "submitted_at"         TIMESTAMP(3),
  "completed_at"         TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"           TEXT NOT NULL REFERENCES "user"("id"),
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"           TEXT NOT NULL,
  "deleted_at"           TIMESTAMP(3),
  "deleted_by"           TEXT,
  UNIQUE ("company_id", "application_number")
);

-- CreateSequence
CREATE SEQUENCE "vehicle_application_number_seq";

-- CreateIndexes
CREATE INDEX "idx_vehicle_application_company" ON "vehicle_application"("company_id");
CREATE INDEX "idx_vehicle_application_employee" ON "vehicle_application"("employee_id");
CREATE INDEX "idx_vehicle_application_vehicle" ON "vehicle_application"("vehicle_id");
CREATE INDEX "idx_vehicle_application_driver" ON "vehicle_application"("driver_id");
CREATE INDEX "idx_vehicle_application_status" ON "vehicle_application"("status");
CREATE INDEX "idx_vehicle_application_company_deleted" ON "vehicle_application"("company_id", "deleted_at");
CREATE INDEX "idx_vehicle_application_attachment_folder" ON "vehicle_application"("attachment_folder_id");
CREATE INDEX "idx_vehicle_application_project" ON "vehicle_application"("project_id");
CREATE INDEX "idx_vehicle_application_departure_return" ON "vehicle_application"("departure_datetime", "return_datetime");
