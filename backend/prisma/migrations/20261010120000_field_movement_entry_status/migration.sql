-- Per-entry approval status (mirrors log on submit/approve/reject/cancel).
ALTER TABLE "field_movement_entry"
ADD COLUMN "status" "FieldMovementStatus" NOT NULL DEFAULT 'DRAFT';

UPDATE "field_movement_entry" AS e
SET "status" = l."status"
FROM "field_movement_log" AS l
WHERE e."log_id" = l."id";

CREATE INDEX "idx_field_movement_entry_status" ON "field_movement_entry"("status");
