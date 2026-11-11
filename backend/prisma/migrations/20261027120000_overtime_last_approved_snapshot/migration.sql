-- Snapshot of the last approved overtime sheet entries for edit-diff on resubmit.

ALTER TABLE "overtime_sheet"
  ADD COLUMN "last_approved_snapshot" JSONB;
