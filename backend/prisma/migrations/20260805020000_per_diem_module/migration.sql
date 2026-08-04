ALTER TYPE "FolderContextType" ADD VALUE 'PER_DIEM';

CREATE TYPE "PerDiemStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'IN_REVIEW',
  'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'
);

CREATE TABLE "per_diem_request" (
  "id"                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"               TEXT NOT NULL REFERENCES "company"("id"),
  "request_number"           TEXT NOT NULL,
  "employee_id"              TEXT NOT NULL REFERENCES "user"("id"),
  "per_diem_rate_id"         TEXT REFERENCES "per_diem_rate"("id"),
  "destination_category"     TEXT NOT NULL,
  "destination"              TEXT NOT NULL,
  "start_date"               DATE NOT NULL,
  "end_date"                 DATE NOT NULL,
  "days"                     INTEGER NOT NULL,
  "daily_rate"               NUMERIC(12, 2) NOT NULL,
  "currency"                 "SupportedCurrency" NOT NULL DEFAULT 'ETB',
  "total_amount"             NUMERIC(14, 2) NOT NULL,
  "total_amount_etb"         NUMERIC(14, 2) NOT NULL,
  "exchange_rate"            NUMERIC(18, 6) NOT NULL DEFAULT 1,
  "linked_flight_id"         TEXT REFERENCES "flight_application"("id"),
  "linked_business_trip_id"  TEXT REFERENCES "business_trip"("id"),
  "notes"                    TEXT,
  "status"                   "PerDiemStatus" NOT NULL DEFAULT 'DRAFT',
  "approval_request_id"      TEXT UNIQUE REFERENCES "approval_request"("id"),
  "attachment_folder_id"     TEXT REFERENCES "document_folder"("id"),
  "submitted_at"             TIMESTAMP(3),
  "completed_at"             TIMESTAMP(3),
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"               TEXT NOT NULL REFERENCES "user"("id"),
  "updated_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"               TEXT NOT NULL REFERENCES "user"("id"),
  "deleted_at"               TIMESTAMP(3),
  "deleted_by"               TEXT,
  UNIQUE ("company_id", "request_number")
);

CREATE SEQUENCE "per_diem_request_number_seq";

CREATE INDEX "idx_per_diem_company" ON "per_diem_request"("company_id");
CREATE INDEX "idx_per_diem_employee" ON "per_diem_request"("employee_id");
CREATE INDEX "idx_per_diem_status" ON "per_diem_request"("status");
