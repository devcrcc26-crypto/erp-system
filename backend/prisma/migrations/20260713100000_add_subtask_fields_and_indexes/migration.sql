-- Change 6 Phase 1: subtask ID system + subtask metadata fields
-- All new columns are nullable - existing rows unaffected until Phase 2 backfill.

-- AlterTable: task_discipline.discipline_index
ALTER TABLE "task_discipline" ADD COLUMN "discipline_index" INTEGER;

-- AlterTable: design_package subtask fields
ALTER TABLE "design_package"
  ADD COLUMN "subtask_index" INTEGER,
  ADD COLUMN "subtask_id" TEXT,
  ADD COLUMN "name_zh" TEXT,
  ADD COLUMN "main_work_content" TEXT,
  ADD COLUMN "planned_start_date" DATE,
  ADD COLUMN "planned_finish_date" DATE,
  ADD COLUMN "actual_work_days" INTEGER,
  ADD COLUMN "urgency_level" "UrgencyLevel",
  ADD COLUMN "review_level" "ApprovalLevel";
