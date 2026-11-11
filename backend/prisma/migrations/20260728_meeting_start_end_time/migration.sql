-- Time-of-day strings ("HH:mm") for the meeting create form / detail drawer.
-- Kept separate from meeting_date (which stays a plain calendar date/time)
-- to avoid timezone-combination complexity for a simple display field.
ALTER TABLE meeting
  ADD COLUMN IF NOT EXISTS start_time TEXT,
  ADD COLUMN IF NOT EXISTS end_time TEXT;
