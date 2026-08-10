-- Finish aligning drifted correspondence / issue_response with migration history.
-- (Catch-up 20260808100000 was resolve --applied; these changes must actually run.)

-- Correspondence: direction required + TIMESTAMP(3)
UPDATE "correspondence"
SET "direction" = 'OUTGOING'
WHERE "direction" IS NULL;

ALTER TABLE "correspondence"
  ALTER COLUMN "direction" SET NOT NULL;

ALTER TABLE "correspondence"
  ALTER COLUMN "sent_at" TYPE TIMESTAMP(3)
  USING "sent_at"::TIMESTAMP(3),
  ALTER COLUMN "acknowledged_at" TYPE TIMESTAMP(3)
  USING "acknowledged_at"::TIMESTAMP(3);

-- Recreate correspondence FKs to match migration definitions
ALTER TABLE "correspondence" DROP CONSTRAINT IF EXISTS "correspondence_company_id_fkey";
ALTER TABLE "correspondence" DROP CONSTRAINT IF EXISTS "correspondence_acknowledged_by_fkey";
ALTER TABLE "correspondence" DROP CONSTRAINT IF EXISTS "correspondence_parent_correspondence_id_fkey";

ALTER TABLE "correspondence"
  ADD CONSTRAINT "correspondence_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "correspondence"
  ADD CONSTRAINT "correspondence_acknowledged_by_fkey"
  FOREIGN KEY ("acknowledged_by") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "correspondence"
  ADD CONSTRAINT "correspondence_parent_correspondence_id_fkey"
  FOREIGN KEY ("parent_correspondence_id") REFERENCES "correspondence"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Recreate issue_response FKs to match 20260724_extend_issue_fields
ALTER TABLE "issue_response" DROP CONSTRAINT IF EXISTS "issue_response_issue_id_fkey";
ALTER TABLE "issue_response" DROP CONSTRAINT IF EXISTS "issue_response_responded_by_fkey";
ALTER TABLE "issue_response" DROP CONSTRAINT IF EXISTS "issue_response_response_document_id_fkey";

ALTER TABLE "issue_response"
  ADD CONSTRAINT "issue_response_issue_id_fkey"
  FOREIGN KEY ("issue_id") REFERENCES "issue"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "issue_response"
  ADD CONSTRAINT "issue_response_responded_by_fkey"
  FOREIGN KEY ("responded_by") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "issue_response"
  ADD CONSTRAINT "issue_response_response_document_id_fkey"
  FOREIGN KEY ("response_document_id") REFERENCES "document"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
