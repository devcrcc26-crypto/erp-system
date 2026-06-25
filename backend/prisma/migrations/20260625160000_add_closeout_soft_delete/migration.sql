-- AlterTable
ALTER TABLE "closeout" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" TEXT;

-- AlterTable
ALTER TABLE "closeout_checklist_item" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" TEXT;

-- CreateIndex
CREATE INDEX "idx_closeout_project_deleted" ON "closeout"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_closeout_deleted_at" ON "closeout"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_closeout_checklist_closeout_deleted" ON "closeout_checklist_item"("closeout_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_closeout_checklist_deleted_at" ON "closeout_checklist_item"("deleted_at");
