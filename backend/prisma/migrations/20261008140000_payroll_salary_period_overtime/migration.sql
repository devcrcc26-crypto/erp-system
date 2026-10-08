-- Per-period overtime hours and pay (priced from that period's contractual basic).
ALTER TABLE "payroll_salary_period"
  ADD COLUMN IF NOT EXISTS "normal_ot_hours" DECIMAL(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "evening_ot_hours" DECIMAL(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sunday_ot_hours" DECIMAL(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "holiday_ot_hours" DECIMAL(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "normal_ot_pay" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "evening_ot_pay" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sunday_ot_pay" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "holiday_ot_pay" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_ot_pay" DECIMAL(14, 2) NOT NULL DEFAULT 0;
