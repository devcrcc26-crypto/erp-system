-- Correspondence attribution: who sent vs named parties

ALTER TABLE "correspondence"
  ADD COLUMN IF NOT EXISTS "sent_by" TEXT,
  ADD COLUMN IF NOT EXISTS "recipient_user_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_correspondence_sent_by"
  ON "correspondence"("sent_by");
CREATE INDEX IF NOT EXISTS "idx_correspondence_recipient_user_id"
  ON "correspondence"("recipient_user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'correspondence_sent_by_fkey'
  ) THEN
    ALTER TABLE "correspondence"
      ADD CONSTRAINT "correspondence_sent_by_fkey"
      FOREIGN KEY ("sent_by") REFERENCES "user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'correspondence_recipient_user_id_fkey'
  ) THEN
    ALTER TABLE "correspondence"
      ADD CONSTRAINT "correspondence_recipient_user_id_fkey"
      FOREIGN KEY ("recipient_user_id") REFERENCES "user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
