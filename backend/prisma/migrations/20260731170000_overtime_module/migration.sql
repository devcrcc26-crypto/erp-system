-- Overtime Application module

CREATE TYPE "OvertimeStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELLED'
);

CREATE TYPE "OvertimeCompensation" AS ENUM (
  'EXTRA_PAY',
  'TIME_OFF_IN_LIEU'
);

CREATE TABLE "overtime_request" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "request_number" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "start_time" TIME NOT NULL,
  "end_time" TIME NOT NULL,
  "hours" DECIMAL(4,1) NOT NULL,
  "reason" TEXT NOT NULL,
  "project_id" TEXT,
  "compensation_type" "OvertimeCompensation",
  "status" "OvertimeStatus" NOT NULL DEFAULT 'DRAFT',
  "approval_request_id" TEXT,
  "submitted_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,

  CONSTRAINT "overtime_request_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "overtime_request_company_id_request_number_key"
  ON "overtime_request"("company_id", "request_number");

CREATE UNIQUE INDEX "overtime_request_approval_request_id_key"
  ON "overtime_request"("approval_request_id");

CREATE INDEX "idx_overtime_request_company"
  ON "overtime_request"("company_id");

CREATE INDEX "idx_overtime_request_employee"
  ON "overtime_request"("employee_id");

CREATE INDEX "idx_overtime_request_status"
  ON "overtime_request"("status");

CREATE INDEX "idx_overtime_request_date"
  ON "overtime_request"("date");

CREATE INDEX "idx_overtime_request_project"
  ON "overtime_request"("project_id");

ALTER TABLE "overtime_request"
  ADD CONSTRAINT "overtime_request_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "overtime_request"
  ADD CONSTRAINT "overtime_request_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "overtime_request"
  ADD CONSTRAINT "overtime_request_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "overtime_request"
  ADD CONSTRAINT "overtime_request_approval_request_id_fkey"
  FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "overtime_request"
  ADD CONSTRAINT "overtime_request_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
