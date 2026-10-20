ALTER TABLE "per_diem_request"
  ADD COLUMN IF NOT EXISTS "approved_daily_rate" DECIMAL(12, 2);
