-- Work schedule "scan only" mode: any scan that day = present; an earliest scan
-- after latest_scan_time is flagged for HR review (no pay effect).
-- Columns only: existing schedules default to STANDARD.

-- CreateEnum
CREATE TYPE "WorkScheduleCheckMode" AS ENUM ('STANDARD', 'SCAN_ONLY');

-- CreateEnum
CREATE TYPE "AttendanceScanReviewFlag" AS ENUM ('SCAN_AFTER_DEADLINE');

-- CreateEnum
CREATE TYPE "AttendanceScanReviewDecision" AS ENUM ('EXCUSED', 'MARKED_LATE');

-- AlterTable
ALTER TABLE "work_schedule"
ADD COLUMN "check_mode" "WorkScheduleCheckMode" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "latest_scan_time" TEXT;

-- AlterTable
ALTER TABLE "attendance_daily_log"
ADD COLUMN "scan_review_flag" "AttendanceScanReviewFlag",
ADD COLUMN "scan_review_time" TEXT,
ADD COLUMN "needs_review" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "scan_review_decision" "AttendanceScanReviewDecision",
ADD COLUMN "scan_review_note" TEXT,
ADD COLUMN "scan_reviewed_by_id" TEXT,
ADD COLUMN "scan_reviewed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "idx_attendance_daily_log_scan_review_flag" ON "attendance_daily_log"("scan_review_flag");

-- AddForeignKey
ALTER TABLE "attendance_daily_log" ADD CONSTRAINT "attendance_daily_log_scan_reviewed_by_id_fkey" FOREIGN KEY ("scan_reviewed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
