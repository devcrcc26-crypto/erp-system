-- AlterTable
ALTER TABLE "task_dependency" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by" TEXT;

-- CreateIndex
CREATE INDEX "idx_task_dependency_deleted_at" ON "task_dependency"("deleted_at");
