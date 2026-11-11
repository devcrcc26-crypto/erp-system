-- Distinguishes end-of-day 24:00 from midnight 00:00 on the same calendar day.
ALTER TABLE "overtime_entry"
  ADD COLUMN IF NOT EXISTS "ends_at_end_of_day" BOOLEAN NOT NULL DEFAULT false;
