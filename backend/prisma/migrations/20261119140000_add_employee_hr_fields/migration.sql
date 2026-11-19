-- Employee HR profile fields, repeating education and prior employment,
-- and effective-dated position/salary history.

CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED');

ALTER TABLE "user"
ADD COLUMN "place_of_birth" TEXT,
ADD COLUMN "kebele" TEXT,
ADD COLUMN "marital_status" "MaritalStatus",
ADD COLUMN "id_issue_date" DATE,
ADD COLUMN "id_expiry_date" DATE,
ADD COLUMN "pension_number" TEXT;

CREATE TABLE "education_record" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "institute_name" TEXT NOT NULL,
    "graduation_year" INTEGER,
    "subject_major" TEXT,
    "certificate_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "education_record_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prior_employment" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "employer_name" TEXT NOT NULL,
    "date_from" DATE,
    "date_to" DATE,
    "last_position" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "prior_employment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "position_history" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "position_id" TEXT,
    "salary_override" DECIMAL(14,2),
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "position_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_education_record_company_id" ON "education_record"("company_id");
CREATE INDEX "idx_education_record_company_deleted" ON "education_record"("company_id", "deleted_at");
CREATE INDEX "idx_education_record_user_id" ON "education_record"("user_id");

CREATE INDEX "idx_prior_employment_company_id" ON "prior_employment"("company_id");
CREATE INDEX "idx_prior_employment_company_deleted" ON "prior_employment"("company_id", "deleted_at");
CREATE INDEX "idx_prior_employment_user_id" ON "prior_employment"("user_id");

CREATE INDEX "idx_position_history_company_id" ON "position_history"("company_id");
CREATE INDEX "idx_position_history_company_deleted" ON "position_history"("company_id", "deleted_at");
CREATE INDEX "idx_position_history_user_id" ON "position_history"("user_id");
CREATE INDEX "idx_position_history_user_from" ON "position_history"("user_id", "effective_from");
CREATE INDEX "idx_position_history_position_id" ON "position_history"("position_id");

ALTER TABLE "education_record" ADD CONSTRAINT "education_record_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "education_record" ADD CONSTRAINT "education_record_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prior_employment" ADD CONSTRAINT "prior_employment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prior_employment" ADD CONSTRAINT "prior_employment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "position_history" ADD CONSTRAINT "position_history_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
