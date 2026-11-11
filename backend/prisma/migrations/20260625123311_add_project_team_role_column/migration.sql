-- AlterTable
ALTER TABLE "project_team" ADD COLUMN     "role_on_project" TEXT;

-- AlterTable
ALTER TABLE "task_discipline" ALTER COLUMN "updated_at" DROP DEFAULT;
