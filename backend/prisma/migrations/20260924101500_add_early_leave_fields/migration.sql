-- AlterTable
ALTER TABLE "attendance_record" ADD COLUMN IF NOT EXISTS "early_leave_days" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "attendance_daily_log" ADD COLUMN IF NOT EXISTS "is_early_leave" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "attendance_daily_log" ADD COLUMN IF NOT EXISTS "early_leave_minutes" INTEGER NOT NULL DEFAULT 0;