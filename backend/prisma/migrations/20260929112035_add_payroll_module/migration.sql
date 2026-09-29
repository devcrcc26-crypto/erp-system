-- CreateEnum
CREATE TYPE "payroll_run_status" AS ENUM ('DRAFT', 'REVIEWED', 'SUBMITTED', 'APPROVED', 'GM_APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "payroll_entry_flag" AS ENUM ('NONE', 'MISSING_ATTENDANCE', 'MISSING_CONTRACT', 'MISSING_OVERTIME_APPROVAL', 'ZERO_SALARY', 'MANUAL_OVERRIDE');

-- CreateTable
CREATE TABLE "payroll_run" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "run_number" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "payroll_run_status" NOT NULL DEFAULT 'DRAFT',
    "total_employees" INTEGER NOT NULL DEFAULT 0,
    "total_gross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_net_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_pension_emp" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_pension_emr" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_threshold" DECIMAL(10,2) NOT NULL DEFAULT 2200,
    "notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "submitted_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "gm_approved_at" TIMESTAMP(3),
    "gm_approved_by" TEXT,
    "paid_at" TIMESTAMP(3),
    "paid_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "payroll_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_entry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "attendance_record_id" TEXT,
    "overtime_sheet_id" TEXT,
    "scheduled_days" INTEGER NOT NULL DEFAULT 0,
    "present_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "absent_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "payroll_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "basic_salary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transport_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monthly_bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "earned_salary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "normal_ot_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "evening_ot_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "sunday_ot_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "holiday_ot_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "normal_ot_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "evening_ot_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sunday_ot_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "holiday_ot_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_ot_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_transport" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "non_taxable_transport" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_income" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_income" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pension_employee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pension_employer" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "income_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonus_top_up" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonus_top_up_reason" TEXT,
    "flag" "payroll_entry_flag" NOT NULL DEFAULT 'NONE',
    "flag_note" TEXT,
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "override_reason" TEXT,
    "override_by" TEXT,
    "override_at" TIMESTAMP(3),
    "bank_name" TEXT,
    "bank_account_number" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "payroll_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_salary_period" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "days" DECIMAL(5,2) NOT NULL,
    "basic_salary" DECIMAL(14,2) NOT NULL,
    "earned_salary" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "payroll_salary_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_payslip" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "document_id" TEXT,
    "generated_at" TIMESTAMP(3),
    "generated_by" TEXT,
    "released_at" TIMESTAMP(3),
    "released_by" TEXT,
    "downloaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "payroll_payslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_payroll_run_company" ON "payroll_run"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payroll_run_company_month_year" ON "payroll_run"("company_id", "month", "year");

-- CreateIndex
CREATE INDEX "idx_payroll_entry_company" ON "payroll_entry"("company_id");

-- CreateIndex
CREATE INDEX "idx_payroll_entry_run" ON "payroll_entry"("run_id");

-- CreateIndex
CREATE INDEX "idx_payroll_entry_employee" ON "payroll_entry"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payroll_entry_run_employee" ON "payroll_entry"("run_id", "employee_id");

-- CreateIndex
CREATE INDEX "idx_payroll_salary_period_entry" ON "payroll_salary_period"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payslip_entry_id_key" ON "payroll_payslip"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payslip_document_id_key" ON "payroll_payslip"("document_id");

-- CreateIndex
CREATE INDEX "idx_payroll_payslip_company" ON "payroll_payslip"("company_id");

-- CreateIndex
CREATE INDEX "idx_payroll_payslip_employee" ON "payroll_payslip"("employee_id");

-- CreateIndex
CREATE INDEX "idx_payroll_payslip_run" ON "payroll_payslip"("run_id");

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_gm_approved_by_fkey" FOREIGN KEY ("gm_approved_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "employee_contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_overtime_sheet_id_fkey" FOREIGN KEY ("overtime_sheet_id") REFERENCES "overtime_sheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_override_by_fkey" FOREIGN KEY ("override_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_salary_period" ADD CONSTRAINT "payroll_salary_period_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "payroll_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_salary_period" ADD CONSTRAINT "payroll_salary_period_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "employee_contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_salary_period" ADD CONSTRAINT "payroll_salary_period_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_salary_period" ADD CONSTRAINT "payroll_salary_period_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payslip" ADD CONSTRAINT "payroll_payslip_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payslip" ADD CONSTRAINT "payroll_payslip_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "payroll_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payslip" ADD CONSTRAINT "payroll_payslip_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payslip" ADD CONSTRAINT "payroll_payslip_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payslip" ADD CONSTRAINT "payroll_payslip_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payslip" ADD CONSTRAINT "payroll_payslip_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payslip" ADD CONSTRAINT "payroll_payslip_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payslip" ADD CONSTRAINT "payroll_payslip_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payslip" ADD CONSTRAINT "payroll_payslip_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
