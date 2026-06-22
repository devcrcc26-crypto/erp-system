-- Construction submittal attachments and discipline-lead routing
ALTER TYPE "FolderContextType" ADD VALUE 'SUBMITTAL';
ALTER TYPE "SubmittalPurpose" ADD VALUE 'IN_CONSTRUCTION';
ALTER TYPE "SubmittalPreparedByRole" ADD VALUE 'SITE_TEAM';

ALTER TABLE "submittal" ADD COLUMN "assigned_to" TEXT;

CREATE INDEX "idx_submittal_assigned_to" ON "submittal"("assigned_to");

ALTER TABLE "submittal" ADD CONSTRAINT "submittal_assigned_to_fkey"
  FOREIGN KEY ("assigned_to") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
