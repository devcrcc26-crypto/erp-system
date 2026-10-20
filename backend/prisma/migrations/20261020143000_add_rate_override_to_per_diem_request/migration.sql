-- AddColumn requested_daily_rate and rate_override_reason to per_diem_request
ALTER TABLE "per_diem_request" ADD COLUMN "requested_daily_rate" DECIMAL(12, 2);
ALTER TABLE "per_diem_request" ADD COLUMN "rate_override_reason" TEXT;
