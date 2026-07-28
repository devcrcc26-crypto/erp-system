-- Free-text pre-meeting agenda blurb shown on the create form and detail
-- drawer. Distinct from the existing per-topic meeting_agenda_item table,
-- which remains available for structured topic/decision tracking.
ALTER TABLE meeting
  ADD COLUMN IF NOT EXISTS agenda TEXT;
