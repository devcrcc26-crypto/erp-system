-- Approver-only accounts take no part in HR processes (no own leave, overtime,
-- attendance or field movement; never an on-behalf target).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "excluded_from_hr_processes" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "excluded_reason" TEXT;
