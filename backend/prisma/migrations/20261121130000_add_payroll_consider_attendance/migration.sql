-- Payroll: per-run switch to calculate without attendance data (transition periods).
-- Existing runs keep considering attendance.

ALTER TABLE "payroll_run" ADD COLUMN "consider_attendance" BOOLEAN NOT NULL DEFAULT true;
