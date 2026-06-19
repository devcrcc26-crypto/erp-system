-- Simplify project team to user membership only
ALTER TABLE "project_team" DROP COLUMN IF EXISTS "role_on_project";
ALTER TABLE "project_team" DROP COLUMN IF EXISTS "assigned_from";
ALTER TABLE "project_team" DROP COLUMN IF EXISTS "assigned_to";

CREATE INDEX IF NOT EXISTS "idx_project_team_project_deleted"
  ON "project_team"("project_id", "deleted_at");

-- Task: replace assignee fields with dispatcher + institute chief user FKs
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "dispatcher_user_id" TEXT;
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "institute_chief_user_id" TEXT;

ALTER TABLE "task" DROP CONSTRAINT IF EXISTS "task_assigned_to_fkey";
ALTER TABLE "task" DROP CONSTRAINT IF EXISTS "task_responsible_person_id_fkey";

DROP INDEX IF EXISTS "idx_task_assigned_to";
DROP INDEX IF EXISTS "idx_task_responsible_person_id";

ALTER TABLE "task" DROP COLUMN IF EXISTS "assigned_to";
ALTER TABLE "task" DROP COLUMN IF EXISTS "responsible_person_id";
ALTER TABLE "task" DROP COLUMN IF EXISTS "chief_engineer_name";
ALTER TABLE "task" DROP COLUMN IF EXISTS "dispatcher_name";

ALTER TABLE "task"
  ADD CONSTRAINT "task_dispatcher_user_id_fkey"
  FOREIGN KEY ("dispatcher_user_id") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task"
  ADD CONSTRAINT "task_institute_chief_user_id_fkey"
  FOREIGN KEY ("institute_chief_user_id") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_task_dispatcher_user_id"
  ON "task"("dispatcher_user_id");

CREATE INDEX IF NOT EXISTS "idx_task_institute_chief_user_id"
  ON "task"("institute_chief_user_id");
