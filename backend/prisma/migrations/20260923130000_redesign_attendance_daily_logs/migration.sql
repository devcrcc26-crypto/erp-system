-- Redesign attendance around daily clock logs (Ethiopia-local recalculation).
-- Existing machine-aggregated rows are invalid and must be re-imported.

DELETE FROM "attendance_record";
DELETE FROM "attendance_import_batch";

-- Drop obsolete aggregated columns
ALTER TABLE "attendance_record" DROP COLUMN IF EXISTS "expected_days";
ALTER TABLE "attendance_record" DROP COLUMN IF EXISTS "actual_days";
ALTER TABLE "attendance_record" DROP COLUMN IF EXISTS "expected_hours";
ALTER TABLE "attendance_record" DROP COLUMN IF EXISTS "actual_hours";
ALTER TABLE "attendance_record" DROP COLUMN IF EXISTS "overtime_paid_hours";
ALTER TABLE "attendance_record" DROP COLUMN IF EXISTS "overtime_time_off_hours";
ALTER TABLE "attendance_record" DROP COLUMN IF EXISTS "late_count";
ALTER TABLE "attendance_record" DROP COLUMN IF EXISTS "late_minutes";
ALTER TABLE "attendance_record" DROP COLUMN IF EXISTS "early_leave_count";
ALTER TABLE "attendance_record" DROP COLUMN IF EXISTS "early_leave_minutes";
ALTER TABLE "attendance_record" DROP COLUMN IF EXISTS "missing_clock_in";
ALTER TABLE "attendance_record" DROP COLUMN IF EXISTS "missing_clock_out";

-- Add recalculated summary columns (table is empty after DELETE)
ALTER TABLE "attendance_record" ADD COLUMN IF NOT EXISTS "scheduled_days" DECIMAL(4,1);
ALTER TABLE "attendance_record" ADD COLUMN IF NOT EXISTS "present_days" DECIMAL(4,1);
ALTER TABLE "attendance_record" ADD COLUMN IF NOT EXISTS "holiday_days" DECIMAL(4,1) NOT NULL DEFAULT 0;
ALTER TABLE "attendance_record" ADD COLUMN IF NOT EXISTS "late_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attendance_record" ADD COLUMN IF NOT EXISTS "total_late_minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attendance_record" ADD COLUMN IF NOT EXISTS "missing_clock_in_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attendance_record" ADD COLUMN IF NOT EXISTS "missing_clock_out_days" INTEGER NOT NULL DEFAULT 0;

-- Ensure absent_days remains; scheduled/present cannot stay nullable for Prisma
UPDATE "attendance_record" SET "scheduled_days" = 0 WHERE "scheduled_days" IS NULL;
UPDATE "attendance_record" SET "present_days" = 0 WHERE "present_days" IS NULL;
ALTER TABLE "attendance_record" ALTER COLUMN "scheduled_days" SET NOT NULL;
ALTER TABLE "attendance_record" ALTER COLUMN "present_days" SET NOT NULL;

-- Create daily log table
CREATE TABLE IF NOT EXISTS "attendance_daily_log" (
    "id" TEXT NOT NULL,
    "attendance_record_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clock_in_machine" TEXT,
    "clock_out_machine" TEXT,
    "clock_in_local" TEXT,
    "clock_out_local" TEXT,
    "is_holiday" BOOLEAN NOT NULL DEFAULT false,
    "holiday_name" TEXT,
    "is_weekend" BOOLEAN NOT NULL DEFAULT false,
    "is_half_day" BOOLEAN NOT NULL DEFAULT false,
    "was_present" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_hours" DECIMAL(4,1) NOT NULL DEFAULT 0,
    "recorded_hours" DECIMAL(5,2),
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "missing_clock_in" BOOLEAN NOT NULL DEFAULT false,
    "missing_clock_out" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attendance_daily_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_attendance_daily_log_record_date"
  ON "attendance_daily_log"("attendance_record_id", "date");

CREATE INDEX IF NOT EXISTS "idx_attendance_daily_log_record"
  ON "attendance_daily_log"("attendance_record_id");

CREATE INDEX IF NOT EXISTS "idx_attendance_daily_log_date"
  ON "attendance_daily_log"("date");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_daily_log_attendance_record_id_fkey'
  ) THEN
    ALTER TABLE "attendance_daily_log"
      ADD CONSTRAINT "attendance_daily_log_attendance_record_id_fkey"
      FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_record"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
