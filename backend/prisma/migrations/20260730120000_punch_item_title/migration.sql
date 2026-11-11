-- Add required title to punch_item; backfill from description for existing rows.

ALTER TABLE punch_item
  ADD COLUMN IF NOT EXISTS title TEXT;

UPDATE punch_item
SET title = LEFT(description, 120)
WHERE title IS NULL OR title = '';

ALTER TABLE punch_item
  ALTER COLUMN title SET NOT NULL;
