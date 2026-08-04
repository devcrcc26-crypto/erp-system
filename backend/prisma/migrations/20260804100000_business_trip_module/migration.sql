-- Business Trip (Third-Country) module
-- Depends on FlightTripType, FlightTicketClass, FlightVisaStatus, FlightAcknowledgementStatus

ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'BUSINESS_TRIP';

DO $$ BEGIN
  CREATE TYPE "BusinessTripStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'IN_REVIEW',
    'APPROVED',
    'REJECTED',
    'RETURNED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SEQUENCE IF NOT EXISTS business_trip_number_seq;

CREATE TABLE IF NOT EXISTS "business_trip" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "trip_number" TEXT NOT NULL,
  "submitted_by" TEXT NOT NULL,
  "trip_type" "FlightTripType" NOT NULL,
  "origin" TEXT NOT NULL,
  "destination_country" TEXT NOT NULL,
  "destination_city" TEXT NOT NULL,
  "departure_date" DATE NOT NULL,
  "return_date" DATE,
  "purpose" TEXT NOT NULL,
  "host_organization" TEXT,
  "host_contact" TEXT,
  "expected_outcomes" TEXT,
  "itinerary" TEXT,
  "ticket_class" "FlightTicketClass" NOT NULL DEFAULT 'ECONOMY',
  "estimated_flight_cost" NUMERIC(12,2),
  "estimated_accommodation_cost" NUMERIC(12,2),
  "estimated_per_diem" NUMERIC(12,2),
  "estimated_other_cost" NUMERIC(12,2),
  "estimated_total_cost" NUMERIC(12,2) GENERATED ALWAYS AS (
    COALESCE(estimated_flight_cost, 0) +
    COALESCE(estimated_accommodation_cost, 0) +
    COALESCE(estimated_per_diem, 0) +
    COALESCE(estimated_other_cost, 0)
  ) STORED,
  "accommodation_required" BOOLEAN NOT NULL DEFAULT true,
  "accommodation_details" TEXT,
  "per_diem_required" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "status" "BusinessTripStatus" NOT NULL DEFAULT 'DRAFT',
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
  CONSTRAINT "business_trip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "business_trip_passenger" (
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "passport_number" TEXT,
  "visa_required" BOOLEAN NOT NULL DEFAULT true,
  "visa_status" "FlightVisaStatus" DEFAULT 'NOT_APPLIED',
  "ticket_document_id" TEXT,
  "acknowledgement_status" "FlightAcknowledgementStatus" NOT NULL DEFAULT 'PENDING',
  "acknowledged_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_trip_passenger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "business_trip_document" (
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_trip_document_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_trip_company_id_fkey') THEN
    ALTER TABLE "business_trip"
      ADD CONSTRAINT "business_trip_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_trip_submitted_by_fkey') THEN
    ALTER TABLE "business_trip"
      ADD CONSTRAINT "business_trip_submitted_by_fkey"
      FOREIGN KEY ("submitted_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_trip_created_by_fkey') THEN
    ALTER TABLE "business_trip"
      ADD CONSTRAINT "business_trip_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_trip_approval_request_id_fkey') THEN
    ALTER TABLE "business_trip"
      ADD CONSTRAINT "business_trip_approval_request_id_fkey"
      FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_trip_attachment_folder_id_fkey') THEN
    ALTER TABLE "business_trip"
      ADD CONSTRAINT "business_trip_attachment_folder_id_fkey"
      FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_trip_combined_ticket_document_id_fkey') THEN
    ALTER TABLE "business_trip"
      ADD CONSTRAINT "business_trip_combined_ticket_document_id_fkey"
      FOREIGN KEY ("combined_ticket_document_id") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_trip_passenger_trip_id_fkey') THEN
    ALTER TABLE "business_trip_passenger"
      ADD CONSTRAINT "business_trip_passenger_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "business_trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_trip_passenger_employee_id_fkey') THEN
    ALTER TABLE "business_trip_passenger"
      ADD CONSTRAINT "business_trip_passenger_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_trip_passenger_ticket_document_id_fkey') THEN
    ALTER TABLE "business_trip_passenger"
      ADD CONSTRAINT "business_trip_passenger_ticket_document_id_fkey"
      FOREIGN KEY ("ticket_document_id") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_trip_document_trip_id_fkey') THEN
    ALTER TABLE "business_trip_document"
      ADD CONSTRAINT "business_trip_document_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "business_trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_trip_document_document_id_fkey') THEN
    ALTER TABLE "business_trip_document"
      ADD CONSTRAINT "business_trip_document_document_id_fkey"
      FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_business_trip_company_number"
  ON "business_trip"("company_id", "trip_number");

CREATE UNIQUE INDEX IF NOT EXISTS "business_trip_approval_request_id_key"
  ON "business_trip"("approval_request_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_business_trip_passenger_trip_employee"
  ON "business_trip_passenger"("trip_id", "employee_id");

CREATE INDEX IF NOT EXISTS "idx_business_trip_company" ON "business_trip"("company_id");
CREATE INDEX IF NOT EXISTS "idx_business_trip_submitted_by" ON "business_trip"("submitted_by");
CREATE INDEX IF NOT EXISTS "idx_business_trip_status" ON "business_trip"("status");
CREATE INDEX IF NOT EXISTS "idx_business_trip_company_deleted" ON "business_trip"("company_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "idx_business_trip_attachment_folder" ON "business_trip"("attachment_folder_id");
CREATE INDEX IF NOT EXISTS "idx_business_trip_passenger_trip" ON "business_trip_passenger"("trip_id");
CREATE INDEX IF NOT EXISTS "idx_business_trip_passenger_employee" ON "business_trip_passenger"("employee_id");
CREATE INDEX IF NOT EXISTS "idx_business_trip_document_trip" ON "business_trip_document"("trip_id");
CREATE INDEX IF NOT EXISTS "idx_business_trip_document_document" ON "business_trip_document"("document_id");
