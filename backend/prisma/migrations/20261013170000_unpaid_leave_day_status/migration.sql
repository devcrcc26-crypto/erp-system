-- Distinct unpaid-leave day status + month counter for review/payroll display.
ALTER TYPE "AttendanceDayStatus" ADD VALUE IF NOT EXISTS 'UNPAID_LEAVE';

ALTER TABLE "attendance_record"
  ADD COLUMN IF NOT EXISTS "unpaid_leave_days" DECIMAL(5, 2) NOT NULL DEFAULT 0;
