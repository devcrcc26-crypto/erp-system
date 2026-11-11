-- CreateIndex
CREATE UNIQUE INDEX "daily_log_project_date_shift_unique" ON "daily_log"("project_id", "log_date", "shift");
