-- Site assignments for remote project work (attendance ON_SITE)

CREATE TYPE "SiteAssignmentStatus" AS ENUM (
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELLED'
);

CREATE TABLE "site_assignment" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "request_number" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "site_name" TEXT NOT NULL,
  "project_id" TEXT,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "reason" TEXT,
  "status" "SiteAssignmentStatus" NOT NULL DEFAULT 'SUBMITTED',
  "approval_request_id" TEXT,
  "submitted_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,

  CONSTRAINT "site_assignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_site_assignment_company_number" ON "site_assignment"("company_id", "request_number");
CREATE UNIQUE INDEX "site_assignment_approval_request_id_key" ON "site_assignment"("approval_request_id");
CREATE INDEX "idx_site_assignment_company" ON "site_assignment"("company_id");
CREATE INDEX "idx_site_assignment_company_deleted" ON "site_assignment"("company_id", "deleted_at");
CREATE INDEX "idx_site_assignment_employee" ON "site_assignment"("employee_id");
CREATE INDEX "idx_site_assignment_status" ON "site_assignment"("status");
CREATE INDEX "idx_site_assignment_dates" ON "site_assignment"("start_date", "end_date");
CREATE INDEX "idx_site_assignment_project" ON "site_assignment"("project_id");

ALTER TABLE "site_assignment"
  ADD CONSTRAINT "site_assignment_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "site_assignment"
  ADD CONSTRAINT "site_assignment_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "site_assignment"
  ADD CONSTRAINT "site_assignment_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "site_assignment"
  ADD CONSTRAINT "site_assignment_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "site_assignment"
  ADD CONSTRAINT "site_assignment_approval_request_id_fkey"
  FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_daily_log"
  ADD COLUMN "site_assignment_name" TEXT;
