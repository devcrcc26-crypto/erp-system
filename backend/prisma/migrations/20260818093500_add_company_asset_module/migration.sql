-- Company asset register and employee asset assignments.

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'REPAIRING', 'DISPOSED', 'IN_USE');

-- CreateTable
CREATE TABLE "company_asset" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "photo_document_id" TEXT,

    CONSTRAINT "company_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignment" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returned_to" TEXT,
    "notes" TEXT,
    "returned_by_id" TEXT,
    "returned_at" TIMESTAMP(3),
    "returned_notes" TEXT,
    "issued_by_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "asset_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_company_asset" ON "company_asset"("company_id");

-- CreateIndex
CREATE INDEX "idx_company_asset_deleted" ON "company_asset"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_company_asset_photo_document" ON "company_asset"("photo_document_id");

-- CreateIndex
CREATE INDEX "idx_company_asset_status" ON "company_asset"("status");

-- CreateIndex
CREATE UNIQUE INDEX "company_asset_company_id_serial_number_key" ON "company_asset"("company_id", "serial_number");

-- CreateIndex
CREATE INDEX "idx_company_asset_assignment_asset" ON "asset_assignment"("company_id", "asset_id");

-- CreateIndex
CREATE INDEX "idx_company_asset_assignment_user" ON "asset_assignment"("company_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_company_asset_assignment_issued_by" ON "asset_assignment"("company_id", "issued_by_id");

-- CreateIndex
CREATE INDEX "idx_company_asset_assignment_returned_by" ON "asset_assignment"("company_id", "returned_by_id");

-- CreateIndex
CREATE INDEX "idx_company_asset_assignment_deleted" ON "asset_assignment"("company_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "company_asset" ADD CONSTRAINT "company_asset_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_asset" ADD CONSTRAINT "company_asset_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "company_asset" ADD CONSTRAINT "company_asset_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "company_asset" ADD CONSTRAINT "company_asset_photo_document_id_fkey" FOREIGN KEY ("photo_document_id") REFERENCES "document"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "company_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_returned_by_id_fkey" FOREIGN KEY ("returned_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
