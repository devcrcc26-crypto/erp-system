-- Link optional review markup / rejection files to SubmittalReview.
ALTER TABLE "submittal_review"
  ADD COLUMN IF NOT EXISTS "attachment_document_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_submittal_review_attachment_document_id"
  ON "submittal_review"("attachment_document_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'submittal_review_attachment_document_id_fkey'
  ) THEN
    ALTER TABLE "submittal_review"
      ADD CONSTRAINT "submittal_review_attachment_document_id_fkey"
      FOREIGN KEY ("attachment_document_id")
      REFERENCES "document"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
