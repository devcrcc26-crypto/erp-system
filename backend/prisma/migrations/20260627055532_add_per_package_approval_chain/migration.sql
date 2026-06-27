-- AlterTable
ALTER TABLE "design_package" ADD COLUMN     "package_chief_user_id" TEXT,
ADD COLUMN     "package_discipline_lead_user_id" TEXT,
ADD COLUMN     "package_institute_chief_user_id" TEXT,
ADD COLUMN     "package_owner_user_id" TEXT,
ADD COLUMN     "package_reviewer_user_id" TEXT;

-- CreateIndex
CREATE INDEX "idx_design_package_package_owner_user_id" ON "design_package"("package_owner_user_id");

-- CreateIndex
CREATE INDEX "idx_design_package_package_reviewer_user_id" ON "design_package"("package_reviewer_user_id");

-- CreateIndex
CREATE INDEX "idx_design_package_package_discipline_lead_user_id" ON "design_package"("package_discipline_lead_user_id");

-- CreateIndex
CREATE INDEX "idx_design_package_package_chief_user_id" ON "design_package"("package_chief_user_id");

-- CreateIndex
CREATE INDEX "idx_design_package_package_institute_chief_user_id" ON "design_package"("package_institute_chief_user_id");

-- AddForeignKey
ALTER TABLE "design_package" ADD CONSTRAINT "design_package_package_owner_user_id_fkey" FOREIGN KEY ("package_owner_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_package" ADD CONSTRAINT "design_package_package_reviewer_user_id_fkey" FOREIGN KEY ("package_reviewer_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_package" ADD CONSTRAINT "design_package_package_discipline_lead_user_id_fkey" FOREIGN KEY ("package_discipline_lead_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_package" ADD CONSTRAINT "design_package_package_chief_user_id_fkey" FOREIGN KEY ("package_chief_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_package" ADD CONSTRAINT "design_package_package_institute_chief_user_id_fkey" FOREIGN KEY ("package_institute_chief_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
