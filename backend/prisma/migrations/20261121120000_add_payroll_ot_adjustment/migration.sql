-- Payroll: manual OT adjustments for paper-based OT records (per run / employee / OT category).


-- CreateEnum
CREATE TYPE "payroll_ot_category" AS ENUM ('NORMAL', 'EVENING', 'SUNDAY', 'HOLIDAY');

-- CreateTable
CREATE TABLE "payroll_ot_adjustment" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "ot_category" "payroll_ot_category" NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "applied_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" VARCHAR(500),
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_ot_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_payroll_ot_adjustment_company" ON "payroll_ot_adjustment"("company_id");

-- CreateIndex
CREATE INDEX "idx_payroll_ot_adjustment_employee" ON "payroll_ot_adjustment"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payroll_ot_adjustment_run_employee_category" ON "payroll_ot_adjustment"("payroll_run_id", "employee_id", "ot_category");

-- AddForeignKey
ALTER TABLE "payroll_ot_adjustment" ADD CONSTRAINT "payroll_ot_adjustment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_ot_adjustment" ADD CONSTRAINT "payroll_ot_adjustment_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_ot_adjustment" ADD CONSTRAINT "payroll_ot_adjustment_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_ot_adjustment" ADD CONSTRAINT "payroll_ot_adjustment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_ot_adjustment" ADD CONSTRAINT "payroll_ot_adjustment_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

