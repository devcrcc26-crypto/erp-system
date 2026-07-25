-- Support multiple change requests linked to one RFI.
ALTER TABLE "rfi"
  ADD COLUMN "linked_cr_ids" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "rfi"
SET "linked_cr_ids" = ARRAY["linked_cr_id"]
WHERE "linked_cr_id" IS NOT NULL;
