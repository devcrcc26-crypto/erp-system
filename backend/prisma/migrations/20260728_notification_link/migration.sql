-- Adds a nullable link field to Notification, so a notification can point
-- at the resource it concerns (e.g. a meeting drawer) for click-through.
ALTER TABLE notification
  ADD COLUMN IF NOT EXISTS link TEXT;
