-- HR leave / overtime optional attachments

ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'LEAVE';
ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'OVERTIME';

ALTER TABLE "leave_request"
  ADD COLUMN IF NOT EXISTS "attachment_folder_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_request_attachment_folder_id_fkey'
  ) THEN
    ALTER TABLE "leave_request"
      ADD CONSTRAINT "leave_request_attachment_folder_id_fkey"
      FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_leave_request_attachment_folder"
  ON "leave_request"("attachment_folder_id");

CREATE TABLE IF NOT EXISTS "leave_request_document" (
  "id" TEXT NOT NULL,
  "leave_request_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_request_document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_leave_request_document_leave"
  ON "leave_request_document"("leave_request_id");

CREATE INDEX IF NOT EXISTS "idx_leave_request_document_document"
  ON "leave_request_document"("document_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_request_document_leave_request_id_fkey'
  ) THEN
    ALTER TABLE "leave_request_document"
      ADD CONSTRAINT "leave_request_document_leave_request_id_fkey"
      FOREIGN KEY ("leave_request_id") REFERENCES "leave_request"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_request_document_document_id_fkey'
  ) THEN
    ALTER TABLE "leave_request_document"
      ADD CONSTRAINT "leave_request_document_document_id_fkey"
      FOREIGN KEY ("document_id") REFERENCES "document"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "overtime_sheet"
  ADD COLUMN IF NOT EXISTS "attachment_folder_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'overtime_sheet_attachment_folder_id_fkey'
  ) THEN
    ALTER TABLE "overtime_sheet"
      ADD CONSTRAINT "overtime_sheet_attachment_folder_id_fkey"
      FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_overtime_sheet_attachment_folder"
  ON "overtime_sheet"("attachment_folder_id");

CREATE TABLE IF NOT EXISTS "overtime_entry_document" (
  "id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "overtime_entry_document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_overtime_entry_document_entry"
  ON "overtime_entry_document"("entry_id");

CREATE INDEX IF NOT EXISTS "idx_overtime_entry_document_document"
  ON "overtime_entry_document"("document_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'overtime_entry_document_entry_id_fkey'
  ) THEN
    ALTER TABLE "overtime_entry_document"
      ADD CONSTRAINT "overtime_entry_document_entry_id_fkey"
      FOREIGN KEY ("entry_id") REFERENCES "overtime_entry"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'overtime_entry_document_document_id_fkey'
  ) THEN
    ALTER TABLE "overtime_entry_document"
      ADD CONSTRAINT "overtime_entry_document_document_id_fkey"
      FOREIGN KEY ("document_id") REFERENCES "document"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
