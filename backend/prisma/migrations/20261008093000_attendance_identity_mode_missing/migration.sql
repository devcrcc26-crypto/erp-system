-- AttendanceMode on users; freelancers default to EXEMPT
CREATE TYPE "AttendanceMode" AS ENUM ('SCANNER', 'EXEMPT');

ALTER TABLE "user" ADD COLUMN "attendance_mode" "AttendanceMode" NOT NULL DEFAULT 'SCANNER';

UPDATE "user"
SET "attendance_mode" = 'EXEMPT'
WHERE "employee_type" = 'FREELANCER';

-- Identity / match / unmatched / missing enums
CREATE TYPE "AttendanceIdentityStatus" AS ENUM ('MAPPED', 'IGNORED');
CREATE TYPE "AttendanceMatchMethod" AS ENUM (
  'IDENTITY',
  'EMPLOYEE_ID',
  'NAME_HIGH',
  'NAME_REVIEW',
  'MANUAL',
  'EXEMPT',
  'MANUAL_PRESENT'
);
CREATE TYPE "AttendanceUnmatchedStatus" AS ENUM ('UNMATCHED', 'IGNORED');
CREATE TYPE "AttendanceMissingResolution" AS ENUM (
  'PENDING',
  'MARKED_EXEMPT',
  'MANUAL_PRESENT',
  'NEEDS_ENROLMENT'
);

-- Persist match method on attendance records
ALTER TABLE "attendance_record"
ADD COLUMN "match_method" "AttendanceMatchMethod" NOT NULL DEFAULT 'EMPLOYEE_ID';

-- Persistent Deli identity mapping
CREATE TABLE "attendance_identity" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "attendance_id" TEXT NOT NULL,
  "attendance_name" TEXT NOT NULL,
  "status" "AttendanceIdentityStatus" NOT NULL,
  "user_id" TEXT,
  "reason" TEXT,
  "decided_by" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,

  CONSTRAINT "attendance_identity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_attendance_identity_company_id_name"
  ON "attendance_identity"("company_id", "attendance_id", "attendance_name");
CREATE INDEX "idx_attendance_identity_company"
  ON "attendance_identity"("company_id");
CREATE INDEX "idx_attendance_identity_company_deleted"
  ON "attendance_identity"("company_id", "deleted_at");
CREATE INDEX "idx_attendance_identity_company_status"
  ON "attendance_identity"("company_id", "status");
CREATE INDEX "idx_attendance_identity_user"
  ON "attendance_identity"("user_id");

ALTER TABLE "attendance_identity"
  ADD CONSTRAINT "attendance_identity_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_identity"
  ADD CONSTRAINT "attendance_identity_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_identity"
  ADD CONSTRAINT "attendance_identity_decided_by_fkey"
  FOREIGN KEY ("decided_by") REFERENCES "user"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Unmatched / ignored file rows per batch
CREATE TABLE "attendance_import_unmatched" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "attendance_id" TEXT NOT NULL,
  "attendance_name" TEXT NOT NULL,
  "status" "AttendanceUnmatchedStatus" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attendance_import_unmatched_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_attendance_import_unmatched_batch"
  ON "attendance_import_unmatched"("batch_id");
CREATE INDEX "idx_attendance_import_unmatched_company"
  ON "attendance_import_unmatched"("company_id");

ALTER TABLE "attendance_import_unmatched"
  ADD CONSTRAINT "attendance_import_unmatched_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_import_unmatched"
  ADD CONSTRAINT "attendance_import_unmatched_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "attendance_import_batch"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Active SCANNER employees missing from the file
CREATE TABLE "attendance_import_missing" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "resolution" "AttendanceMissingResolution" NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "resolved_by" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "attendance_import_missing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_attendance_import_missing_batch_user"
  ON "attendance_import_missing"("batch_id", "user_id");
CREATE INDEX "idx_attendance_import_missing_company"
  ON "attendance_import_missing"("company_id");
CREATE INDEX "idx_attendance_import_missing_batch"
  ON "attendance_import_missing"("batch_id");
CREATE INDEX "idx_attendance_import_missing_user"
  ON "attendance_import_missing"("user_id");
CREATE INDEX "idx_attendance_import_missing_resolution"
  ON "attendance_import_missing"("resolution");

ALTER TABLE "attendance_import_missing"
  ADD CONSTRAINT "attendance_import_missing_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_import_missing"
  ADD CONSTRAINT "attendance_import_missing_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "attendance_import_batch"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_import_missing"
  ADD CONSTRAINT "attendance_import_missing_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_import_missing"
  ADD CONSTRAINT "attendance_import_missing_resolved_by_fkey"
  FOREIGN KEY ("resolved_by") REFERENCES "user"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
