-- HR profile fields: secondary phone, seniority lookup, years of experience
-- (number + as-of date, replacing experience_start_date), education levels
-- TECHNICIAN / SECONDARY / PRIMARY.

-- Guard: experience_start_date is dropped, not converted. Abort if any row
-- still has a value so no environment loses data silently.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "user" WHERE "experience_start_date" IS NOT NULL) THEN
    RAISE EXCEPTION 'user.experience_start_date has values; convert them to years_of_experience before this migration';
  END IF;
END $$;

-- AlterEnum


ALTER TYPE "EducationLevel" ADD VALUE 'TECHNICIAN';
ALTER TYPE "EducationLevel" ADD VALUE 'SECONDARY';
ALTER TYPE "EducationLevel" ADD VALUE 'PRIMARY';

-- AlterTable
ALTER TABLE "user" DROP COLUMN "experience_start_date",
ADD COLUMN     "secondary_phone" TEXT,
ADD COLUMN     "seniority_level_id" TEXT,
ADD COLUMN     "years_of_experience" DOUBLE PRECISION,
ADD COLUMN     "years_of_experience_as_of" DATE;

-- CreateTable
CREATE TABLE "seniority_level" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_zh" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "seniority_level_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_seniority_level_company_id" ON "seniority_level"("company_id");

-- CreateIndex
CREATE INDEX "idx_seniority_level_company_deleted" ON "seniority_level"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_user_seniority_level_id" ON "user"("seniority_level_id");

-- AddForeignKey
ALTER TABLE "seniority_level" ADD CONSTRAINT "seniority_level_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_seniority_level_id_fkey" FOREIGN KEY ("seniority_level_id") REFERENCES "seniority_level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

