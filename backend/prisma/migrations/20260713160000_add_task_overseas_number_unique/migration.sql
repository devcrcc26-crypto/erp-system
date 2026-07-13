-- CreateIndex
CREATE UNIQUE INDEX "uq_task_project_overseas_task_number" ON "task"("project_id", "overseas_task_number");
