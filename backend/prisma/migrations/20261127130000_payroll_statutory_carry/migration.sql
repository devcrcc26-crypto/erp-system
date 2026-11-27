-- Correction tax / pension differences on reconciliation items, remitted once
-- (in full) by the first payroll run that settles the item.

-- AlterTable
ALTER TABLE "payroll_reconciliation" ADD COLUMN     "employee_pension_difference" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "employer_pension_difference" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "income_tax_difference" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "statutory_run_id" TEXT;

-- CreateTable
CREATE TABLE "payroll_statutory_adjustment" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "reconciliation_id" TEXT NOT NULL,
    "for_month" INTEGER NOT NULL,
    "for_year" INTEGER NOT NULL,
    "income_tax" DECIMAL(14,2) NOT NULL,
    "pension_employee" DECIMAL(14,2) NOT NULL,
    "pension_employer" DECIMAL(14,2) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_statutory_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_statutory_adjustment_reconciliation_id_key" ON "payroll_statutory_adjustment"("reconciliation_id");

-- CreateIndex
CREATE INDEX "idx_payroll_statutory_adjustment_run" ON "payroll_statutory_adjustment"("payroll_run_id");

-- CreateIndex
CREATE INDEX "idx_payroll_statutory_adjustment_company" ON "payroll_statutory_adjustment"("company_id");

-- AddForeignKey
ALTER TABLE "payroll_statutory_adjustment" ADD CONSTRAINT "payroll_statutory_adjustment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_statutory_adjustment" ADD CONSTRAINT "payroll_statutory_adjustment_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_statutory_adjustment" ADD CONSTRAINT "payroll_statutory_adjustment_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "payroll_reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

