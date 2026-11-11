-- Cast overtime_entry time columns from TIME(6) to TIME(0) to match schema @db.Time(0).
-- Enforce NOT NULL on generated total_hours (SET NOT NULL is valid; SET DEFAULT is not).

ALTER TABLE "overtime_entry"
  ALTER COLUMN "start_time" TYPE TIME(0) USING "start_time"::time(0),
  ALTER COLUMN "end_time" TYPE TIME(0) USING "end_time"::time(0);

ALTER TABLE "overtime_entry"
  ALTER COLUMN "total_hours" SET NOT NULL;
