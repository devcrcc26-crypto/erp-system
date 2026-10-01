-- Per diem advance → settlement. Existing rate amounts are left unchanged.

CREATE TYPE "PerDiemTripType" AS ENUM ('TRAVEL', 'SITE_DEPLOYMENT');

CREATE TYPE "PerDiemBalanceDirection" AS ENUM ('TO_COMPANY', 'TO_EMPLOYEE', 'NONE');

CREATE SEQUENCE IF NOT EXISTS "per_diem_pv_number_seq";

CREATE TABLE "per_diem_settlement" (
  "id"                        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"                TEXT NOT NULL,
  "request_number"            TEXT NOT NULL,
  "employee_id"               TEXT NOT NULL,
  "destination"               TEXT NOT NULL,
  "destination_category"      TEXT NOT NULL,
  "actual_departure_date"     DATE NOT NULL,
  "actual_departure_time"     TEXT NOT NULL,
  "actual_return_date"        DATE NOT NULL,
  "actual_return_time"        TEXT NOT NULL,
  "actual_days"               INTEGER NOT NULL,
  "daily_rate"                DECIMAL(12, 2) NOT NULL,
  "per_diem_earned"           DECIMAL(14, 2) NOT NULL,
  "total_advances"            DECIMAL(14, 2) NOT NULL,
  "balance"                   DECIMAL(14, 2) NOT NULL,
  "balance_direction"         "PerDiemBalanceDirection" NOT NULL,
  "vehicle_used"              BOOLEAN NOT NULL DEFAULT false,
  "km_departure"              INTEGER,
  "km_return"                 INTEGER,
  "cash_returned_receipt_no"  TEXT,
  "cash_returned_date"        DATE,
  "notes"                     TEXT,
  "status"                    "PerDiemStatus" NOT NULL DEFAULT 'DRAFT',
  "approval_request_id"       TEXT,
  "submitted_at"              TIMESTAMP(3),
  "completed_at"              TIMESTAMP(3),
  "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"                TEXT NOT NULL,
  "updated_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"                TEXT NOT NULL,
  "deleted_at"                TIMESTAMP(3),
  "deleted_by"                TEXT,
  CONSTRAINT "per_diem_settlement_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "per_diem_settlement_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "per_diem_settlement_approval_request_id_fkey"
    FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "per_diem_settlement_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "per_diem_settlement_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "per_diem_settlement_company_id_request_number_key"
  ON "per_diem_settlement"("company_id", "request_number");

CREATE UNIQUE INDEX "per_diem_settlement_approval_request_id_key"
  ON "per_diem_settlement"("approval_request_id");

CREATE INDEX "idx_per_diem_settlement_company"
  ON "per_diem_settlement"("company_id");

CREATE INDEX "idx_per_diem_settlement_company_deleted"
  ON "per_diem_settlement"("company_id", "deleted_at");

CREATE INDEX "idx_per_diem_settlement_employee"
  ON "per_diem_settlement"("employee_id");

CREATE INDEX "idx_per_diem_settlement_status"
  ON "per_diem_settlement"("status");

ALTER TABLE "per_diem_request"
  ADD COLUMN "trip_type" "PerDiemTripType" NOT NULL DEFAULT 'TRAVEL',
  ADD COLUMN "departure_time" TEXT,
  ADD COLUMN "return_time" TEXT,
  ADD COLUMN "pv_number" TEXT,
  ADD COLUMN "pv_date" DATE,
  ADD COLUMN "settlement_id" TEXT;

CREATE UNIQUE INDEX "uq_per_diem_company_pv_number"
  ON "per_diem_request"("company_id", "pv_number");

CREATE INDEX "idx_per_diem_settlement"
  ON "per_diem_request"("settlement_id");

ALTER TABLE "per_diem_request"
  ADD CONSTRAINT "per_diem_request_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "per_diem_settlement"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
