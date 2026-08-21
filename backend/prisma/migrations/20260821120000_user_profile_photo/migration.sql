-- AlterTable
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "photo_document_id" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_user_photo_document" ON "user"("photo_document_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_photo_document_id_fkey'
  ) THEN
    ALTER TABLE "user"
      ADD CONSTRAINT "user_photo_document_id_fkey"
      FOREIGN KEY ("photo_document_id")
      REFERENCES "document"("id")
      ON DELETE NO ACTION
      ON UPDATE NO ACTION;
  END IF;
END $$;
