-- Per diem advance payment tracking, site-assignment link, and settlement reminders.

ALTER TABLE "per_diem_request"
  ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paid_by" TEXT,
  ADD COLUMN IF NOT EXISTS "paid_amount" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "payment_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "site_assignment_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_settlement_reminder_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "idx_per_diem_paid_at"
  ON "per_diem_request"("company_id", "paid_at");

CREATE INDEX IF NOT EXISTS "idx_per_diem_site_assignment"
  ON "per_diem_request"("site_assignment_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'per_diem_request_paid_by_fkey'
  ) THEN
    ALTER TABLE "per_diem_request"
      ADD CONSTRAINT "per_diem_request_paid_by_fkey"
      FOREIGN KEY ("paid_by") REFERENCES "user"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'per_diem_request_site_assignment_id_fkey'
  ) THEN
    ALTER TABLE "per_diem_request"
      ADD CONSTRAINT "per_diem_request_site_assignment_id_fkey"
      FOREIGN KEY ("site_assignment_id") REFERENCES "site_assignment"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;
