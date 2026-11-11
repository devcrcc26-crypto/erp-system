-- Change Request workflow fields + CHANGE_REQUEST folder context

ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'CHANGE_REQUEST';

ALTER TABLE "project_change_request"
  ADD COLUMN IF NOT EXISTS "change_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "attachment_folder_id" TEXT,
  ADD COLUMN IF NOT EXISTS "assigned_to" TEXT,
  ADD COLUMN IF NOT EXISTS "affected_edv_ids" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "affected_edv_snapshot" JSONB DEFAULT '[]';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_change_request_attachment_folder_id_fkey'
  ) THEN
    ALTER TABLE "project_change_request"
      ADD CONSTRAINT "project_change_request_attachment_folder_id_fkey"
      FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_change_request_assigned_to_fkey'
  ) THEN
    ALTER TABLE "project_change_request"
      ADD CONSTRAINT "project_change_request_assigned_to_fkey"
      FOREIGN KEY ("assigned_to") REFERENCES "user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_project_change_request_attachment_folder_id"
  ON "project_change_request"("attachment_folder_id");
CREATE INDEX IF NOT EXISTS "idx_project_change_request_assigned_to"
  ON "project_change_request"("assigned_to");
