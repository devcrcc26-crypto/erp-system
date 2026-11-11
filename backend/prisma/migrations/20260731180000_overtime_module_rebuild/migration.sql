-- Rebuild overtime: monthly sheets + entries (drops single-request model)

DROP TABLE IF EXISTS "overtime_request" CASCADE;
DROP TYPE IF EXISTS "OvertimeStatus" CASCADE;
DROP TYPE IF EXISTS "OvertimeCompensation" CASCADE;

CREATE TYPE "OvertimeSheetStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELLED'
);

CREATE TABLE "overtime_sheet" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "sheet_number" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "status" "OvertimeSheetStatus" NOT NULL DEFAULT 'DRAFT',
  "total_regular_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "total_night_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "total_weekend_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "total_holiday_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "total_hours" DECIMAL(6,2) GENERATED ALWAYS AS (
    total_regular_hours + total_night_hours +
    total_weekend_hours + total_holiday_hours
  ) STORED,
  "approval_request_id" TEXT,
  "submitted_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,

  CONSTRAINT "overtime_sheet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "overtime_sheet_month_check" CHECK ("month" BETWEEN 1 AND 12)
);

CREATE TABLE "overtime_entry" (
  "id" TEXT NOT NULL,
  "sheet_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "start_time" TIME NOT NULL,
  "end_time" TIME NOT NULL,
  "is_holiday" BOOLEAN NOT NULL DEFAULT false,
  "regular_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "night_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "weekend_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "holiday_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "total_hours" DECIMAL(5,2) GENERATED ALWAYS AS (
    regular_hours + night_hours + weekend_hours + holiday_hours
  ) STORED,
  "task_description" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "overtime_entry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "overtime_sheet_company_employee_month_year_key"
  ON "overtime_sheet"("company_id", "employee_id", "month", "year");

CREATE UNIQUE INDEX "overtime_sheet_approval_request_id_key"
  ON "overtime_sheet"("approval_request_id");

CREATE UNIQUE INDEX "overtime_sheet_company_id_sheet_number_key"
  ON "overtime_sheet"("company_id", "sheet_number");

CREATE UNIQUE INDEX "overtime_entry_sheet_id_date_start_time_end_time_key"
  ON "overtime_entry"("sheet_id", "date", "start_time", "end_time");

CREATE INDEX "idx_overtime_sheet_company" ON "overtime_sheet"("company_id");
CREATE INDEX "idx_overtime_sheet_employee" ON "overtime_sheet"("employee_id");
CREATE INDEX "idx_overtime_sheet_status" ON "overtime_sheet"("status");
CREATE INDEX "idx_overtime_sheet_period" ON "overtime_sheet"("year", "month");
CREATE INDEX "idx_overtime_entry_sheet" ON "overtime_entry"("sheet_id");
CREATE INDEX "idx_overtime_entry_date" ON "overtime_entry"("date");

ALTER TABLE "overtime_sheet"
  ADD CONSTRAINT "overtime_sheet_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "overtime_sheet"
  ADD CONSTRAINT "overtime_sheet_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "overtime_sheet"
  ADD CONSTRAINT "overtime_sheet_approval_request_id_fkey"
  FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "overtime_sheet"
  ADD CONSTRAINT "overtime_sheet_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "overtime_entry"
  ADD CONSTRAINT "overtime_entry_sheet_id_fkey"
  FOREIGN KEY ("sheet_id") REFERENCES "overtime_sheet"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
