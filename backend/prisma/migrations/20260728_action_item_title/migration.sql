-- Add optional title to meeting action items
ALTER TABLE action_item
  ADD COLUMN IF NOT EXISTS title TEXT;
