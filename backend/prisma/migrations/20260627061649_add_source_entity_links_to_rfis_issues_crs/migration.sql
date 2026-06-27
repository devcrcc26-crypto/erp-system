-- AlterTable
ALTER TABLE "issue" ADD COLUMN     "source_entity_id" TEXT,
ADD COLUMN     "source_entity_type" TEXT;

-- AlterTable
ALTER TABLE "project_change_request" ADD COLUMN     "origin_entity_id" TEXT,
ADD COLUMN     "origin_entity_type" TEXT;

-- AlterTable
ALTER TABLE "rfi" ADD COLUMN     "source_entity_id" TEXT,
ADD COLUMN     "source_entity_type" TEXT;
