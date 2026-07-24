-- Optional document attachment on an RFI response.
ALTER TABLE "rfi_response"
  ADD COLUMN IF NOT EXISTS "response_document_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_rfi_response_response_document_id"
  ON "rfi_response"("response_document_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rfi_response_response_document_id_fkey'
  ) THEN
    ALTER TABLE "rfi_response"
      ADD CONSTRAINT "rfi_response_response_document_id_fkey"
      FOREIGN KEY ("response_document_id")
      REFERENCES "document"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
