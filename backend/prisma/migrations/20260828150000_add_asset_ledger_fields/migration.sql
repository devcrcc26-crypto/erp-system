-- AlterTable
ALTER TABLE "company_asset"
ADD COLUMN "asset_code" TEXT,
ADD COLUMN "card_number" TEXT,
ADD COLUMN "asset_name" TEXT,
ADD COLUMN "specifications" TEXT,
ADD COLUMN "asset_category" TEXT,
ADD COLUMN "start_use_date" DATE,
ADD COLUMN "useful_life_months" INTEGER,
ADD COLUMN "original_value" DECIMAL(14, 2),
ADD COLUMN "managing_department" TEXT,
ADD COLUMN "storage_location" TEXT,
ADD COLUMN "project_code" TEXT;

-- CreateIndex
CREATE INDEX "idx_company_asset_code" ON "company_asset"("company_id", "asset_code");
