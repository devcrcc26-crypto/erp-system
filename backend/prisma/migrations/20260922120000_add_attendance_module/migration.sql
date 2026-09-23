-- CreateTable
CREATE TABLE "attendance_import_batch" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "imported_by" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "matched_rows" INTEGER NOT NULL,
    "review_rows" INTEGER NOT NULL,
    "rejected_rows" INTEGER NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_record" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "import_batch_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "expected_days" DECIMAL(4,1) NOT NULL,
    "actual_days" DECIMAL(4,1) NOT NULL,
    "expected_hours" DECIMAL(6,2) NOT NULL,
    "actual_hours" DECIMAL(6,2) NOT NULL,
    "payable_hours" DECIMAL(6,2) NOT NULL,
    "overtime_paid_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "overtime_time_off_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "late_count" INTEGER NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_leave_count" INTEGER NOT NULL DEFAULT 0,
    "early_leave_minutes" INTEGER NOT NULL DEFAULT 0,
    "missing_clock_in" INTEGER NOT NULL DEFAULT 0,
    "missing_clock_out" INTEGER NOT NULL DEFAULT 0,
    "absent_days" DECIMAL(4,1) NOT NULL DEFAULT 0,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_attendance_import_batch_company" ON "attendance_import_batch"("company_id");

-- CreateIndex
CREATE INDEX "idx_attendance_import_batch_importer" ON "attendance_import_batch"("imported_by");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_import_batch_company_id_month_year_key" ON "attendance_import_batch"("company_id", "month", "year");

-- CreateIndex
CREATE INDEX "idx_attendance_record_company_period" ON "attendance_record"("company_id", "month", "year");

-- CreateIndex
CREATE INDEX "idx_attendance_record_employee" ON "attendance_record"("employee_id");

-- CreateIndex
CREATE INDEX "idx_attendance_record_batch" ON "attendance_record"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_record_company_id_employee_id_month_year_key" ON "attendance_record"("company_id", "employee_id", "month", "year");

-- AddForeignKey
ALTER TABLE "attendance_import_batch" ADD CONSTRAINT "attendance_import_batch_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_import_batch" ADD CONSTRAINT "attendance_import_batch_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "attendance_import_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
