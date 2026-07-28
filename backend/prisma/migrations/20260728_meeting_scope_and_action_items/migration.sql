-- Meeting scope (project/discipline/subtask) + minutes text + lifecycle statuses.
-- Extends the existing meeting_attendee (21 rows) and action_item (20 rows)
-- tables in place rather than replacing them.

DO $$ BEGIN
  CREATE TYPE "MeetingScope" AS ENUM ('PROJECT', 'DISCIPLINE', 'SUBTASK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE meeting
  ADD COLUMN IF NOT EXISTS scope "MeetingScope" DEFAULT 'PROJECT',
  ADD COLUMN IF NOT EXISTS task_discipline_id TEXT REFERENCES task_discipline(id),
  ADD COLUMN IF NOT EXISTS design_package_id TEXT REFERENCES design_package(id),
  ADD COLUMN IF NOT EXISTS minutes TEXT;

CREATE INDEX IF NOT EXISTS idx_meeting_task_discipline_id ON meeting (task_discipline_id);
CREATE INDEX IF NOT EXISTS idx_meeting_design_package_id ON meeting (design_package_id);

-- Additive lifecycle statuses; existing SCHEDULED/CONDUCTED/MINUTES_ISSUED/CLOSED
-- rows and values are untouched.
ALTER TYPE "MeetingStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "MeetingStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "MeetingStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- Extend meeting_attendee in place (preserves existing 21 rows).
ALTER TABLE meeting_attendee
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Extend action_item in place (preserves existing 20 rows).
-- owner_id becomes optional so an action item can be assigned to someone
-- outside the system (assigned_to_name), matching the attendee pattern.
ALTER TABLE action_item
  ALTER COLUMN owner_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_name TEXT,
  ADD COLUMN IF NOT EXISTS linked_issue_id TEXT REFERENCES issue(id),
  ADD COLUMN IF NOT EXISTS design_package_id TEXT REFERENCES design_package(id),
  ADD COLUMN IF NOT EXISTS completed_by TEXT REFERENCES "user"(id);

CREATE INDEX IF NOT EXISTS idx_action_item_linked_issue_id ON action_item (linked_issue_id);
CREATE INDEX IF NOT EXISTS idx_action_item_design_package_id ON action_item (design_package_id);
