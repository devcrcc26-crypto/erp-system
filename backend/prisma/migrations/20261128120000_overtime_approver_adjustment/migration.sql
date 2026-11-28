-- Durable record of Reports-to "Approve with changes" edits on an overtime sheet.
ALTER TABLE "overtime_sheet"
  ADD COLUMN IF NOT EXISTS "approver_adjustment" JSONB;
