-- Work schedules, public holidays, employee assignments, and leave periods.

CREATE TYPE "HolidayNationality" AS ENUM ('ETHIOPIAN', 'CHINESE', 'ALL');

ALTER TABLE "user" ADD COLUMN "work_schedule_id" TEXT;

CREATE TABLE "work_schedule" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,

  CONSTRAINT "work_schedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_schedule_day" (
  "id" TEXT NOT NULL,
  "schedule_id" TEXT NOT NULL,
  "day_of_week" INTEGER NOT NULL,
  "is_working_day" BOOLEAN NOT NULL DEFAULT true,
  "is_half_day" BOOLEAN NOT NULL DEFAULT false,
  "morning_start" TEXT,
  "morning_end" TEXT,
  "afternoon_start" TEXT,
  "afternoon_end" TEXT,
  "total_hours" DECIMAL(4,1) NOT NULL DEFAULT 0,

  CONSTRAINT "work_schedule_day_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_schedule_assignment" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "schedule_id" TEXT NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,

  CONSTRAINT "employee_schedule_assignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public_holiday" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "name_zh" TEXT,
  "date" DATE NOT NULL,
  "is_recurring" BOOLEAN NOT NULL DEFAULT false,
  "applies_to_nationality" "HolidayNationality" NOT NULL DEFAULT 'ALL',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "notify_days_before" INTEGER NOT NULL DEFAULT 2,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,

  CONSTRAINT "public_holiday_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leave_request_period" (
  "id" TEXT NOT NULL,
  "leave_request_id" TEXT NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "days" DECIMAL(4,1) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "leave_request_period_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "leave_request" ALTER COLUMN "start_date" DROP NOT NULL;
ALTER TABLE "leave_request" ALTER COLUMN "end_date" DROP NOT NULL;
ALTER TABLE "leave_request" ALTER COLUMN "days" DROP NOT NULL;

CREATE UNIQUE INDEX "uq_work_schedule_company_name" ON "work_schedule"("company_id", "name");
CREATE INDEX "idx_work_schedule_company_id" ON "work_schedule"("company_id");
CREATE INDEX "idx_work_schedule_company_default" ON "work_schedule"("company_id", "is_default");
CREATE INDEX "idx_work_schedule_company_deleted" ON "work_schedule"("company_id", "deleted_at");

CREATE UNIQUE INDEX "uq_work_schedule_day_schedule_dow" ON "work_schedule_day"("schedule_id", "day_of_week");
CREATE INDEX "idx_work_schedule_day_schedule" ON "work_schedule_day"("schedule_id");

CREATE INDEX "idx_emp_sched_assign_employee_from" ON "employee_schedule_assignment"("employee_id", "effective_from");
CREATE INDEX "idx_emp_sched_assign_company" ON "employee_schedule_assignment"("company_id");
CREATE INDEX "idx_emp_sched_assign_schedule" ON "employee_schedule_assignment"("schedule_id");

CREATE UNIQUE INDEX "uq_public_holiday_company_date_nat" ON "public_holiday"("company_id", "date", "applies_to_nationality");
CREATE INDEX "idx_public_holiday_company_date" ON "public_holiday"("company_id", "date");
CREATE INDEX "idx_public_holiday_company_active" ON "public_holiday"("company_id", "is_active");
CREATE INDEX "idx_public_holiday_company_deleted" ON "public_holiday"("company_id", "deleted_at");

CREATE INDEX "idx_leave_request_period_leave" ON "leave_request_period"("leave_request_id");
CREATE INDEX "idx_user_work_schedule" ON "user"("work_schedule_id");

ALTER TABLE "work_schedule"
  ADD CONSTRAINT "work_schedule_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_schedule_day"
  ADD CONSTRAINT "work_schedule_day_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "work_schedule"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_schedule_assignment"
  ADD CONSTRAINT "employee_schedule_assignment_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_schedule_assignment"
  ADD CONSTRAINT "employee_schedule_assignment_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_schedule_assignment"
  ADD CONSTRAINT "employee_schedule_assignment_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "work_schedule"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public_holiday"
  ADD CONSTRAINT "public_holiday_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user"
  ADD CONSTRAINT "user_work_schedule_id_fkey"
  FOREIGN KEY ("work_schedule_id") REFERENCES "work_schedule"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leave_request_period"
  ADD CONSTRAINT "leave_request_period_leave_request_id_fkey"
  FOREIGN KEY ("leave_request_id") REFERENCES "leave_request"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "leave_request_period" ("id", "leave_request_id", "start_date", "end_date", "days", "created_at")
SELECT
  gen_random_uuid()::text,
  lr."id",
  lr."start_date",
  lr."end_date",
  lr."days",
  CURRENT_TIMESTAMP
FROM "leave_request" lr
WHERE lr."start_date" IS NOT NULL
  AND lr."end_date" IS NOT NULL
  AND lr."days" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "leave_request_period" p
    WHERE p."leave_request_id" = lr."id"
  );
