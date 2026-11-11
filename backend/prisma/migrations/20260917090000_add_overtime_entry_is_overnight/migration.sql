-- Overnight entries must now be flagged explicitly (end time <= start time).
ALTER TABLE "overtime_entry"
ADD COLUMN "is_overnight" BOOLEAN NOT NULL DEFAULT false;

-- Existing entries were silently treated as crossing midnight; keep that meaning.
UPDATE "overtime_entry"
SET "is_overnight" = true
WHERE "end_time" <= "start_time";
