-- Attendance paid days, daily log status/deduction, WFH days, payroll employee category

CREATE TYPE "WorkFromHomeScope" AS ENUM ('ALL', 'DEPARTMENTS', 'EMPLOYEES');

CREATE TYPE "AttendanceDayStatus" AS ENUM (
  'PRESENT',
  'ABSENT',
  'HALF_ABSENT',
  'SUNDAY',
  'HOLIDAY',
  'WORK_FROM_HOME',
  'ON_SITE',
  'LEAVE',
  'FIELD_MOVEMENT_PENDING'
);

CREATE TABLE "work_from_home_day" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "scope" "WorkFromHomeScope" NOT NULL DEFAULT 'ALL',
  "department_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "employee_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,

  CONSTRAINT "work_from_home_day_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_work_from_home_day_company_date" ON "work_from_home_day"("company_id", "date");
CREATE INDEX "idx_work_from_home_day_company" ON "work_from_home_day"("company_id");
CREATE INDEX "idx_work_from_home_day_company_deleted" ON "work_from_home_day"("company_id", "deleted_at");
CREATE INDEX "idx_work_from_home_day_company_date" ON "work_from_home_day"("company_id", "date");

ALTER TABLE "work_from_home_day"
  ADD CONSTRAINT "work_from_home_day_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance_record"
  ALTER COLUMN "absent_days" TYPE DECIMAL(5,2),
  ADD COLUMN "paid_days" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "attendance_daily_log"
  ADD COLUMN "day_status" "AttendanceDayStatus" NOT NULL DEFAULT 'PRESENT',
  ADD COLUMN "day_deduction" DECIMAL(3,2) NOT NULL DEFAULT 0;

ALTER TABLE "payroll_entry"
  ADD COLUMN "employee_category" "EmployeeType";
