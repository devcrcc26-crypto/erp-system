ALTER TABLE "exit_permit"
ADD COLUMN "submitted_by" TEXT,
ADD COLUMN "is_on_behalf" BOOLEAN NOT NULL DEFAULT false;

UPDATE "exit_permit"
SET "is_on_behalf" = true
WHERE "employee_id" <> "created_by";

ALTER TABLE "exit_permit"
ADD CONSTRAINT "exit_permit_submitted_by_fkey"
FOREIGN KEY ("submitted_by") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_exit_permit_submitted_by" ON "exit_permit"("submitted_by");
CREATE INDEX "idx_exit_permit_on_behalf" ON "exit_permit"("is_on_behalf");
