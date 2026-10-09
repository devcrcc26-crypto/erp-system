-- Retire FORGOT_TO_CLOCK / forgot_direction; keep FORGOT_CLOCK_IN + FORGOT_CLOCK_OUT.
-- "Both" is modeled as one entry of each reason on the same day.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'field_movement_entry'
      AND column_name = 'forgot_direction'
  ) THEN
    -- Split BOTH rows into an additional FORGOT_CLOCK_OUT entry.
    INSERT INTO "field_movement_entry" (
      "id",
      "log_id",
      "daily_log_id",
      "date",
      "reason",
      "destination",
      "departure_time",
      "return_time",
      "notes",
      "created_at"
    )
    SELECT
      md5(e."id" || '-forgot-out')::uuid::text,
      e."log_id",
      e."daily_log_id",
      e."date",
      'FORGOT_CLOCK_OUT'::"FieldMovementReason",
      e."destination",
      e."departure_time",
      e."return_time",
      e."notes",
      e."created_at"
    FROM "field_movement_entry" e
    WHERE e."reason"::text = 'FORGOT_TO_CLOCK'
      AND e."forgot_direction"::text = 'BOTH'
      AND NOT EXISTS (
        SELECT 1
        FROM "field_movement_entry" x
        WHERE x."log_id" = e."log_id"
          AND x."daily_log_id" = e."daily_log_id"
          AND x."reason"::text = 'FORGOT_CLOCK_OUT'
      );

    UPDATE "field_movement_entry"
    SET "reason" = CASE
      WHEN "forgot_direction"::text = 'OUT' THEN 'FORGOT_CLOCK_OUT'::"FieldMovementReason"
      ELSE 'FORGOT_CLOCK_IN'::"FieldMovementReason"
    END
    WHERE "reason"::text = 'FORGOT_TO_CLOCK';

    ALTER TABLE "field_movement_entry" DROP COLUMN "forgot_direction";
  ELSIF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'FieldMovementReason'
      AND e.enumlabel = 'FORGOT_TO_CLOCK'
  ) THEN
    UPDATE "field_movement_entry"
    SET "reason" = 'FORGOT_CLOCK_OUT'::"FieldMovementReason"
    WHERE "reason"::text = 'FORGOT_TO_CLOCK';
  END IF;
END $$;

DROP TYPE IF EXISTS "FieldMovementForgotDirection";

-- Rebuild FieldMovementReason without FORGOT_TO_CLOCK when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'FieldMovementReason'
      AND e.enumlabel = 'FORGOT_TO_CLOCK'
  ) THEN
    ALTER TYPE "FieldMovementReason" RENAME TO "FieldMovementReason_old";
    CREATE TYPE "FieldMovementReason" AS ENUM (
      'FIELD_VISIT',
      'EARLY_LEAVE',
      'FORGOT_CLOCK_IN',
      'FORGOT_CLOCK_OUT'
    );
    ALTER TABLE "field_movement_entry"
      ALTER COLUMN "reason" TYPE "FieldMovementReason"
      USING "reason"::text::"FieldMovementReason";
    DROP TYPE "FieldMovementReason_old";
  END IF;
END $$;

-- Allow complementary FORGOT_CLOCK_IN + FORGOT_CLOCK_OUT on the same day/log
ALTER TABLE "field_movement_entry"
  DROP CONSTRAINT IF EXISTS "field_movement_entry_log_id_daily_log_id_key";

DROP INDEX IF EXISTS "field_movement_entry_log_id_daily_log_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_field_movement_entry_log_day_reason"
  ON "field_movement_entry" ("log_id", "daily_log_id", "reason");
