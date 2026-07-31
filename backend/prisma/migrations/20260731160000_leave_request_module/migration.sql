-- Leave Request module: enums, leave_request, leave_balance, sequence

CREATE TYPE "LeaveType" AS ENUM (
  'ANNUAL',
  'SICK',
  'UNPAID',
  'MATERNITY',
  'PATERNITY',
  'EMERGENCY',
  'COMPASSIONATE'
);

CREATE TYPE "LeaveRequestStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELLED'
);

CREATE SEQUENCE IF NOT EXISTS "leave_request_number_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE "leave_request" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "request_number" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "leave_type" "LeaveType" NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "days" DECIMAL(4,1) NOT NULL,
  "reason" TEXT,
  "status" "LeaveRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "approval_request_id" TEXT,
  "submitted_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,

  CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leave_balance" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "leave_type" "LeaveType" NOT NULL,
  "entitled" DECIMAL(4,1) NOT NULL DEFAULT 0,
  "used" DECIMAL(4,1) NOT NULL DEFAULT 0,
  "pending" DECIMAL(4,1) NOT NULL DEFAULT 0,
  "remaining" DECIMAL(4,1) GENERATED ALWAYS AS (entitled - used - pending) STORED,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "leave_balance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_request_company_id_request_number_key"
  ON "leave_request"("company_id", "request_number");

CREATE UNIQUE INDEX "leave_request_approval_request_id_key"
  ON "leave_request"("approval_request_id");

CREATE INDEX "leave_request_company_id_idx"
  ON "leave_request"("company_id");

CREATE INDEX "leave_request_employee_id_idx"
  ON "leave_request"("employee_id");

CREATE INDEX "leave_request_status_idx"
  ON "leave_request"("status");

CREATE INDEX "leave_request_start_date_end_date_idx"
  ON "leave_request"("start_date", "end_date");

CREATE UNIQUE INDEX "leave_balance_company_id_employee_id_year_leave_type_key"
  ON "leave_balance"("company_id", "employee_id", "year", "leave_type");

CREATE INDEX "leave_balance_employee_id_year_idx"
  ON "leave_balance"("employee_id", "year");

ALTER TABLE "leave_request"
  ADD CONSTRAINT "leave_request_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leave_request"
  ADD CONSTRAINT "leave_request_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leave_request"
  ADD CONSTRAINT "leave_request_approval_request_id_fkey"
  FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leave_request"
  ADD CONSTRAINT "leave_request_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leave_balance"
  ADD CONSTRAINT "leave_balance_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leave_balance"
  ADD CONSTRAINT "leave_balance_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
