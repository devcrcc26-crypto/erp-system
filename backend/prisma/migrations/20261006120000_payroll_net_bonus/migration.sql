-- Net bonus (after tax): recurring on contract + one-time on payroll entry.

ALTER TABLE "employee_contract"
ADD COLUMN "monthly_net_bonus" DECIMAL(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE "payroll_run"
ADD COLUMN "total_net_bonus" DECIMAL(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE "payroll_entry"
ADD COLUMN "contract_net_bonus" DECIMAL(14, 2) NOT NULL DEFAULT 0,
ADD COLUMN "net_top_up" DECIMAL(14, 2) NOT NULL DEFAULT 0,
ADD COLUMN "net_top_up_reason" TEXT;
