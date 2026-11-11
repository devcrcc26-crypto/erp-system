-- CreateEnum
CREATE TYPE "AttendanceMonthStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED', 'APPROVED', 'UNLOCKED');

-- CreateEnum
CREATE TYPE "FieldMovementReason" AS ENUM ('FIELD_VISIT', 'EARLY_LEAVE', 'FORGOT_CLOCK_IN', 'FORGOT_CLOCK_OUT');

-- CreateEnum
CREATE TYPE "FieldMovementStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceDayFlag" AS ENUM ('MISSING_CLOCK_IN', 'MISSING_CLOCK_OUT', 'EARLY_LEAVE', 'NONE');

-- AlterEnum
ALTER TYPE "FolderContextType" ADD VALUE 'FIELD_MOVEMENT_LOG';

-- AlterTable
ALTER TABLE "attendance_daily_log" ADD COLUMN     "corrected_clock_in_local" TEXT,
ADD COLUMN     "corrected_clock_out_local" TEXT,
ADD COLUMN     "field_movement_entry_id" TEXT,
ADD COLUMN     "flag" "AttendanceDayFlag" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "flag_resolved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "flag_resolved_at" TIMESTAMP(3),
ADD COLUMN     "is_last_export_day" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "attendance_record" ADD COLUMN     "flagged_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resolved_days" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "absent_days" DROP DEFAULT;

-- CreateTable
CREATE TABLE "attendance_monthly_approval" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "import_batch_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "AttendanceMonthStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "unlocked_at" TIMESTAMP(3),
    "unlocked_by" TEXT,
    "unlock_reason" TEXT,
    "notifications_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_monthly_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_movement_log" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "request_number" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "FieldMovementStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "approval_request_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "field_movement_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_movement_entry" (
    "id" TEXT NOT NULL,
    "log_id" TEXT NOT NULL,
    "daily_log_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" "FieldMovementReason" NOT NULL,
    "destination" TEXT,
    "departure_time" TEXT,
    "return_time" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_movement_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_daily_log_correction" (
    "id" TEXT NOT NULL,
    "daily_log_id" TEXT NOT NULL,
    "corrected_by" TEXT NOT NULL,
    "original_clock_in_local" TEXT,
    "original_clock_out_local" TEXT,
    "corrected_clock_in_local" TEXT,
    "corrected_clock_out_local" TEXT,
    "correction_note" TEXT NOT NULL,
    "corrected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_daily_log_correction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_monthly_approval_import_batch_id_key" ON "attendance_monthly_approval"("import_batch_id");

-- CreateIndex
CREATE INDEX "idx_attendance_monthly_approval_company" ON "attendance_monthly_approval"("company_id");

-- CreateIndex
CREATE INDEX "idx_attendance_monthly_approval_status" ON "attendance_monthly_approval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_monthly_approval_company_id_month_year_key" ON "attendance_monthly_approval"("company_id", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "field_movement_log_approval_request_id_key" ON "field_movement_log"("approval_request_id");

-- CreateIndex
CREATE INDEX "idx_field_movement_log_company" ON "field_movement_log"("company_id");

-- CreateIndex
CREATE INDEX "idx_field_movement_log_employee" ON "field_movement_log"("employee_id");

-- CreateIndex
CREATE INDEX "idx_field_movement_log_status" ON "field_movement_log"("status");

-- CreateIndex
CREATE INDEX "idx_field_movement_log_period" ON "field_movement_log"("company_id", "month", "year");

-- CreateIndex
CREATE INDEX "idx_field_movement_log_deleted" ON "field_movement_log"("company_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "field_movement_log_company_id_request_number_key" ON "field_movement_log"("company_id", "request_number");

-- CreateIndex
CREATE INDEX "idx_field_movement_entry_log" ON "field_movement_entry"("log_id");

-- CreateIndex
CREATE INDEX "idx_field_movement_entry_daily_log" ON "field_movement_entry"("daily_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_movement_entry_log_id_daily_log_id_key" ON "field_movement_entry"("log_id", "daily_log_id");

-- CreateIndex
CREATE INDEX "idx_attendance_daily_log_correction_daily_log" ON "attendance_daily_log_correction"("daily_log_id");

-- AddForeignKey
ALTER TABLE "attendance_monthly_approval" ADD CONSTRAINT "attendance_monthly_approval_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_monthly_approval" ADD CONSTRAINT "attendance_monthly_approval_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "attendance_import_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_monthly_approval" ADD CONSTRAINT "attendance_monthly_approval_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_monthly_approval" ADD CONSTRAINT "attendance_monthly_approval_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_monthly_approval" ADD CONSTRAINT "attendance_monthly_approval_unlocked_by_fkey" FOREIGN KEY ("unlocked_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_movement_log" ADD CONSTRAINT "field_movement_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_movement_log" ADD CONSTRAINT "field_movement_log_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_movement_log" ADD CONSTRAINT "field_movement_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_movement_log" ADD CONSTRAINT "field_movement_log_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_movement_entry" ADD CONSTRAINT "field_movement_entry_log_id_fkey" FOREIGN KEY ("log_id") REFERENCES "field_movement_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_movement_entry" ADD CONSTRAINT "field_movement_entry_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "attendance_daily_log"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance_daily_log_correction" ADD CONSTRAINT "attendance_daily_log_correction_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "attendance_daily_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily_log_correction" ADD CONSTRAINT "attendance_daily_log_correction_corrected_by_fkey" FOREIGN KEY ("corrected_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Request number sequence (format: FM-0001)
CREATE SEQUENCE IF NOT EXISTS "field_movement_log_number_seq";
