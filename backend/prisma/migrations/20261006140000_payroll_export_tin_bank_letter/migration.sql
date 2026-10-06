-- Employee TIN for tax declaration; bank letter reference on payroll runs.

ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "tin" TEXT;

ALTER TABLE "payroll_run"
ADD COLUMN IF NOT EXISTS "bank_letter_ref_no" TEXT;
