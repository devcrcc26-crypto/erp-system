-- CreateEnum
CREATE TYPE "TaskAttributes" AS ENUM ('ETHIOPIA', 'CHINA', 'COMBINE1', 'COMBINE2');

-- AlterEnum
ALTER TYPE "UrgencyLevel" ADD VALUE 'VERY_URGENT';

-- AlterTable: new user FK columns
ALTER TABLE "task"
  ADD COLUMN "supervising_chief_user_id" TEXT,
  ADD COLUMN "assigned_person_user_id" TEXT;

-- Safe conversion: task_attributes TEXT -> TaskAttributes enum (null when unknown)
ALTER TABLE "task" ADD COLUMN "task_attributes_enum" "TaskAttributes";

UPDATE "task"
SET "task_attributes_enum" = CASE UPPER(TRIM("task_attributes"))
  WHEN 'ETHIOPIA' THEN 'ETHIOPIA'::"TaskAttributes"
  WHEN 'CHINA' THEN 'CHINA'::"TaskAttributes"
  WHEN 'COMBINE1' THEN 'COMBINE1'::"TaskAttributes"
  WHEN 'COMBINE2' THEN 'COMBINE2'::"TaskAttributes"
  ELSE NULL
END
WHERE "task_attributes" IS NOT NULL;

ALTER TABLE "task" DROP COLUMN "task_attributes";
ALTER TABLE "task" RENAME COLUMN "task_attributes_enum" TO "task_attributes";

-- AddForeignKey
ALTER TABLE "task"
  ADD CONSTRAINT "task_supervising_chief_user_id_fkey"
  FOREIGN KEY ("supervising_chief_user_id") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task"
  ADD CONSTRAINT "task_assigned_person_user_id_fkey"
  FOREIGN KEY ("assigned_person_user_id") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "idx_task_supervising_chief_user_id" ON "task"("supervising_chief_user_id");
CREATE INDEX "idx_task_assigned_person_user_id" ON "task"("assigned_person_user_id");
