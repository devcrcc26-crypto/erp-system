-- AlterTable
ALTER TABLE "user"
ADD COLUMN "reports_to_user_id" TEXT;

-- AddForeignKey
ALTER TABLE "user"
ADD CONSTRAINT "user_reports_to_user_id_fkey"
FOREIGN KEY ("reports_to_user_id") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;

-- CreateIndex
CREATE INDEX "idx_user_reports_to_user_id" ON "user"("reports_to_user_id");
