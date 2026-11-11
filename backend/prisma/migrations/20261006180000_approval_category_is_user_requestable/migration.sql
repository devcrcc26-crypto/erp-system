-- Hide internal/system categories (e.g. PAYROLL_RUN) from the New Request picker.

ALTER TABLE "approval_category"
ADD COLUMN IF NOT EXISTS "is_user_requestable" BOOLEAN NOT NULL DEFAULT true;
