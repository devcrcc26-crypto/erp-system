-- HR policy settings (effective-dated) - additive only.
CREATE TABLE IF NOT EXISTS "policy_setting" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "effective_from" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_setting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_policy_setting_company_key_from"
  ON "policy_setting"("company_id", "key", "effective_from");

ALTER TABLE "payroll_run"
  ADD COLUMN IF NOT EXISTS "policy_review_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "policy_review_note" TEXT;
