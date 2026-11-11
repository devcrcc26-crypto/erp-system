-- AlterTable
ALTER TABLE "project_team" ADD COLUMN     "visible_modules" TEXT[] DEFAULT ARRAY[]::TEXT[];
