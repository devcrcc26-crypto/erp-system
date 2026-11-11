-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'ACHIEVED', 'MISSED');

-- AlterTable
ALTER TABLE "milestone" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "milestone" ALTER COLUMN "status" TYPE "MilestoneStatus" USING (
  CASE "status"
    WHEN 'COMPLETED' THEN 'ACHIEVED'::"MilestoneStatus"
    ELSE "status"::"MilestoneStatus"
  END
);
ALTER TABLE "milestone" ALTER COLUMN "status" SET DEFAULT 'PLANNED'::"MilestoneStatus";
