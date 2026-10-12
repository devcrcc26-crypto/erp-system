ALTER TABLE "approval_request"
ADD COLUMN "is_late_submission" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "late_reason" TEXT;

ALTER TABLE "site_assignment"
ADD COLUMN "is_late_submission" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "late_reason" TEXT;

ALTER TABLE "field_movement_log"
ADD COLUMN "is_late_submission" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "late_reason" TEXT;
