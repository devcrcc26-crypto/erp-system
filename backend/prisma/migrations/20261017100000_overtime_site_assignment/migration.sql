-- Overtime on site-assignment days: scheduled hours become claimable OT.
-- Entries snapshot the covering assignment and the part of their hours that
-- fell inside scheduled hours, so later assignment edits never change hours.

ALTER TABLE "overtime_entry"
  ADD COLUMN "site_assignment_id" TEXT,
  ADD COLUMN "site_within_schedule_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "site_review_flag" VARCHAR(40),
  ADD COLUMN "site_review_flagged_at" TIMESTAMP(3);

CREATE INDEX "idx_overtime_entry_site_assignment" ON "overtime_entry"("site_assignment_id");

ALTER TABLE "overtime_entry"
  ADD CONSTRAINT "overtime_entry_site_assignment_id_fkey"
  FOREIGN KEY ("site_assignment_id") REFERENCES "site_assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Back-fill (label/link and site_within_schedule_hours) is done by
-- scripts/backfill-overtime-site-assignment.ts because it needs each
-- employee's schedule. Hours columns are never modified.
