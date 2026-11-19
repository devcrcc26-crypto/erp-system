-- Supporting documents for inactive periods and separations.
ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'INACTIVE_PERIOD';
ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'EMPLOYMENT_SEPARATION';

ALTER TABLE "inactive_period"
  ADD COLUMN IF NOT EXISTS "attachment_folder_id" TEXT;

ALTER TABLE "employment_period"
  ADD COLUMN IF NOT EXISTS "attachment_folder_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_inactive_period_attachment_folder"
  ON "inactive_period"("attachment_folder_id");

CREATE INDEX IF NOT EXISTS "idx_employment_period_attachment_folder"
  ON "employment_period"("attachment_folder_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inactive_period_attachment_folder_id_fkey'
  ) THEN
    ALTER TABLE "inactive_period"
      ADD CONSTRAINT "inactive_period_attachment_folder_id_fkey"
      FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employment_period_attachment_folder_id_fkey'
  ) THEN
    ALTER TABLE "employment_period"
      ADD CONSTRAINT "employment_period_attachment_folder_id_fkey"
      FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
