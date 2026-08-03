-- Flight Application module

ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'FLIGHT';

DO $$ BEGIN
  CREATE TYPE "FlightTripType" AS ENUM ('ONE_WAY', 'ROUND_TRIP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FlightTicketClass" AS ENUM ('ECONOMY', 'BUSINESS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FlightVisaStatus" AS ENUM ('NOT_APPLIED', 'APPLIED', 'APPROVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FlightApplicationStatus" AS ENUM (
    'DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FlightAcknowledgementStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SEQUENCE IF NOT EXISTS flight_application_number_seq;

CREATE TABLE IF NOT EXISTS "flight_application" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "application_number" TEXT NOT NULL,
  "submitted_by" TEXT NOT NULL,
  "trip_type" "FlightTripType" NOT NULL,
  "is_international" BOOLEAN NOT NULL DEFAULT false,
  "origin" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "departure_date" DATE NOT NULL,
  "return_date" DATE,
  "purpose" TEXT NOT NULL,
  "ticket_class" "FlightTicketClass" NOT NULL DEFAULT 'ECONOMY',
  "accommodation_required" BOOLEAN NOT NULL DEFAULT false,
  "accommodation_details" TEXT,
  "per_diem_required" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "status" "FlightApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "approval_request_id" TEXT,
  "attachment_folder_id" TEXT,
  "combined_ticket_document_id" TEXT,
  "submitted_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,
  CONSTRAINT "flight_application_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "flight_passenger" (
  "id" TEXT NOT NULL,
  "application_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "passport_number" TEXT,
  "visa_required" BOOLEAN NOT NULL DEFAULT false,
  "visa_status" "FlightVisaStatus" DEFAULT 'NOT_APPLIED',
  "ticket_document_id" TEXT,
  "acknowledgement_status" "FlightAcknowledgementStatus" NOT NULL DEFAULT 'PENDING',
  "acknowledged_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flight_passenger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "flight_application_document" (
  "id" TEXT NOT NULL,
  "application_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flight_application_document_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_application_company_id_fkey') THEN
    ALTER TABLE "flight_application"
      ADD CONSTRAINT "flight_application_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_application_submitted_by_fkey') THEN
    ALTER TABLE "flight_application"
      ADD CONSTRAINT "flight_application_submitted_by_fkey"
      FOREIGN KEY ("submitted_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_application_created_by_fkey') THEN
    ALTER TABLE "flight_application"
      ADD CONSTRAINT "flight_application_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_application_approval_request_id_fkey') THEN
    ALTER TABLE "flight_application"
      ADD CONSTRAINT "flight_application_approval_request_id_fkey"
      FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_application_attachment_folder_id_fkey') THEN
    ALTER TABLE "flight_application"
      ADD CONSTRAINT "flight_application_attachment_folder_id_fkey"
      FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_application_combined_ticket_document_id_fkey') THEN
    ALTER TABLE "flight_application"
      ADD CONSTRAINT "flight_application_combined_ticket_document_id_fkey"
      FOREIGN KEY ("combined_ticket_document_id") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_passenger_application_id_fkey') THEN
    ALTER TABLE "flight_passenger"
      ADD CONSTRAINT "flight_passenger_application_id_fkey"
      FOREIGN KEY ("application_id") REFERENCES "flight_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_passenger_employee_id_fkey') THEN
    ALTER TABLE "flight_passenger"
      ADD CONSTRAINT "flight_passenger_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_passenger_ticket_document_id_fkey') THEN
    ALTER TABLE "flight_passenger"
      ADD CONSTRAINT "flight_passenger_ticket_document_id_fkey"
      FOREIGN KEY ("ticket_document_id") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_application_document_application_id_fkey') THEN
    ALTER TABLE "flight_application_document"
      ADD CONSTRAINT "flight_application_document_application_id_fkey"
      FOREIGN KEY ("application_id") REFERENCES "flight_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_application_document_document_id_fkey') THEN
    ALTER TABLE "flight_application_document"
      ADD CONSTRAINT "flight_application_document_document_id_fkey"
      FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_flight_application_company_number"
  ON "flight_application"("company_id", "application_number");

CREATE UNIQUE INDEX IF NOT EXISTS "flight_application_approval_request_id_key"
  ON "flight_application"("approval_request_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_flight_passenger_application_employee"
  ON "flight_passenger"("application_id", "employee_id");

CREATE INDEX IF NOT EXISTS "idx_flight_application_company" ON "flight_application"("company_id");
CREATE INDEX IF NOT EXISTS "idx_flight_application_submitted_by" ON "flight_application"("submitted_by");
CREATE INDEX IF NOT EXISTS "idx_flight_application_status" ON "flight_application"("status");
CREATE INDEX IF NOT EXISTS "idx_flight_application_company_deleted" ON "flight_application"("company_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "idx_flight_application_attachment_folder" ON "flight_application"("attachment_folder_id");
CREATE INDEX IF NOT EXISTS "idx_flight_passenger_application" ON "flight_passenger"("application_id");
CREATE INDEX IF NOT EXISTS "idx_flight_passenger_employee" ON "flight_passenger"("employee_id");
CREATE INDEX IF NOT EXISTS "idx_flight_application_document_application" ON "flight_application_document"("application_id");
CREATE INDEX IF NOT EXISTS "idx_flight_application_document_document" ON "flight_application_document"("document_id");
