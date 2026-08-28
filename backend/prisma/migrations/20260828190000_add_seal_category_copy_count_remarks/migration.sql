-- AlterTable
ALTER TABLE "official_seal"
ADD COLUMN "seal_category" TEXT,
ADD COLUMN "copy_count" INTEGER,
ADD COLUMN "remarks" TEXT;

-- AlterTable
ALTER TABLE "project_seal"
ADD COLUMN "seal_category" TEXT,
ADD COLUMN "copy_count" INTEGER,
ADD COLUMN "remarks" TEXT;
