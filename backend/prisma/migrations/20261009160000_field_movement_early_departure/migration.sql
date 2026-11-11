-- Unified forgot-to-clock reason (legacy FORGOT_CLOCK_IN / OUT kept)
ALTER TYPE "FieldMovementReason" ADD VALUE IF NOT EXISTS 'FORGOT_TO_CLOCK';

DO $$ BEGIN
  CREATE TYPE "FieldMovementForgotDirection" AS ENUM ('IN', 'OUT', 'BOTH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "field_movement_entry"
  ADD COLUMN IF NOT EXISTS "forgot_direction" "FieldMovementForgotDirection";

ALTER TABLE "attendance_daily_log"
  ADD COLUMN IF NOT EXISTS "early_departure_band" TEXT,
  ADD COLUMN IF NOT EXISTS "early_departure_would_deduct" DECIMAL(3, 2) NOT NULL DEFAULT 0;

ALTER TABLE "attendance_record"
  ADD COLUMN IF NOT EXISTS "early_departure_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "early_departure_deducted_days" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "early_departure_would_deduct_days" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "forgot_to_clock_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "approved_field_movement_count" INTEGER NOT NULL DEFAULT 0;
