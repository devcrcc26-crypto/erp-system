-- Leave period half-day portion (morning / afternoon on a single weekday)
CREATE TYPE "leave_day_portion" AS ENUM ('FULL', 'MORNING', 'AFTERNOON');

ALTER TABLE "leave_request_period"
  ADD COLUMN IF NOT EXISTS "day_portion" "leave_day_portion" NOT NULL DEFAULT 'FULL';
