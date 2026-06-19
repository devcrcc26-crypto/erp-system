-- EPC responsibility workflow: discipline owner, remove institute chief, comment files, submittal purpose

-- FolderContextType: RFI, ISSUE
ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'RFI';
ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'ISSUE';

-- New submittal enums
CREATE TYPE "SubmittalPurpose" AS ENUM (
  'DISCIPLINE_SITE',
  'DISCIPLINE_CONSULTANT',
  'DEPUTY_BID',
  'DEPUTY_INTERIM',
  'DEPUTY_FINAL'
);

CREATE TYPE "SubmittalPreparedByRole" AS ENUM (
  'DISCIPLINE_LEAD',
  'DEPUTY_CHIEF'
);

-- ReviewTier: migrate INSTITUTE_CHIEF -> DEPT_CHIEF, add DISCIPLINE_OWNER, drop INSTITUTE_CHIEF
UPDATE "review_session" SET "current_tier" = 'DEPT_CHIEF' WHERE "current_tier" = 'INSTITUTE_CHIEF';
UPDATE "task_discipline_review" SET "review_tier" = 'DEPT_CHIEF' WHERE "review_tier" = 'INSTITUTE_CHIEF';

CREATE TYPE "ReviewTier_new" AS ENUM (
  'DISCIPLINE_OWNER',
  'REVIEWER',
  'DISCIPLINE_LEAD',
  'DEPT_CHIEF'
);

ALTER TABLE "review_session" ALTER COLUMN "current_tier" DROP DEFAULT;

ALTER TABLE "review_session"
  ALTER COLUMN "current_tier" TYPE "ReviewTier_new"
  USING (
    CASE "current_tier"::text
      WHEN 'INSTITUTE_CHIEF' THEN 'DEPT_CHIEF'
      ELSE "current_tier"::text
    END
  )::"ReviewTier_new";

ALTER TABLE "task_discipline_review"
  ALTER COLUMN "review_tier" TYPE "ReviewTier_new"
  USING (
    CASE "review_tier"::text
      WHEN 'INSTITUTE_CHIEF' THEN 'DEPT_CHIEF'
      ELSE "review_tier"::text
    END
  )::"ReviewTier_new";

DROP TYPE "ReviewTier";
ALTER TYPE "ReviewTier_new" RENAME TO "ReviewTier";

ALTER TABLE "review_session"
  ALTER COLUMN "current_tier" SET DEFAULT 'DISCIPLINE_OWNER'::"ReviewTier";

-- Task: remove institute chief
ALTER TABLE "task" DROP CONSTRAINT IF EXISTS "task_institute_chief_user_id_fkey";
DROP INDEX IF EXISTS "idx_task_institute_chief_user_id";
ALTER TABLE "task" DROP COLUMN IF EXISTS "institute_chief_user_id";

-- TaskDiscipline: owner + remove institute fields
ALTER TABLE "task_discipline" ADD COLUMN IF NOT EXISTS "discipline_owner_name" TEXT;
ALTER TABLE "task_discipline" ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT;
ALTER TABLE "task_discipline" DROP COLUMN IF EXISTS "institute_chief_engineer";
ALTER TABLE "task_discipline" DROP COLUMN IF EXISTS "institute_review_time";

CREATE INDEX IF NOT EXISTS "idx_task_discipline_owner_user_id" ON "task_discipline"("owner_user_id");

ALTER TABLE "task_discipline"
  ADD CONSTRAINT "task_discipline_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ReviewComment: optional body + file FKs
ALTER TABLE "review_comment" ALTER COLUMN "body" DROP NOT NULL;
ALTER TABLE "review_comment" ADD COLUMN IF NOT EXISTS "comment_document_version_id" TEXT;
ALTER TABLE "review_comment" ADD COLUMN IF NOT EXISTS "response_document_version_id" TEXT;

ALTER TABLE "review_comment"
  ADD CONSTRAINT "review_comment_comment_document_version_id_fkey"
  FOREIGN KEY ("comment_document_version_id") REFERENCES "document_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "review_comment"
  ADD CONSTRAINT "review_comment_response_document_version_id_fkey"
  FOREIGN KEY ("response_document_version_id") REFERENCES "document_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RFI / Issue / Submittal discipline links
ALTER TABLE "rfi" ADD COLUMN IF NOT EXISTS "task_discipline_id" TEXT;
ALTER TABLE "issue" ADD COLUMN IF NOT EXISTS "task_discipline_id" TEXT;
ALTER TABLE "submittal" ADD COLUMN IF NOT EXISTS "task_discipline_id" TEXT;
ALTER TABLE "submittal" ADD COLUMN IF NOT EXISTS "submittal_purpose" "SubmittalPurpose";
ALTER TABLE "submittal" ADD COLUMN IF NOT EXISTS "prepared_by_role" "SubmittalPreparedByRole";

CREATE INDEX IF NOT EXISTS "idx_rfi_task_discipline_id" ON "rfi"("task_discipline_id");
CREATE INDEX IF NOT EXISTS "idx_issue_task_discipline_id" ON "issue"("task_discipline_id");
CREATE INDEX IF NOT EXISTS "idx_submittal_task_discipline_id" ON "submittal"("task_discipline_id");

ALTER TABLE "rfi"
  ADD CONSTRAINT "rfi_task_discipline_id_fkey"
  FOREIGN KEY ("task_discipline_id") REFERENCES "task_discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "issue"
  ADD CONSTRAINT "issue_task_discipline_id_fkey"
  FOREIGN KEY ("task_discipline_id") REFERENCES "task_discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "submittal"
  ADD CONSTRAINT "submittal_task_discipline_id_fkey"
  FOREIGN KEY ("task_discipline_id") REFERENCES "task_discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
