-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CommentSeverity" AS ENUM ('MINOR', 'MODERATE', 'MAJOR');

-- CreateEnum
CREATE TYPE "ReviewSessionStatus" AS ENUM ('ACTIVE', 'APPROVED', 'RETURNED_FOR_REWORK', 'CLOSED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ReviewSessionOutcome" AS ENUM ('PENDING', 'APPROVED', 'RETURNED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ReviewTier" AS ENUM ('REVIEWER', 'DISCIPLINE_LEAD', 'DEPT_CHIEF', 'INSTITUTE_CHIEF');

-- CreateTable
CREATE TABLE "review_session" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "design_package_id" TEXT NOT NULL,
    "task_discipline_id" TEXT NOT NULL,
    "status" "ReviewSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "outcome" "ReviewSessionOutcome" NOT NULL DEFAULT 'PENDING',
    "current_tier" "ReviewTier" NOT NULL DEFAULT 'REVIEWER',
    "assigned_to_user_id" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "closed_reason" TEXT,
    "sla_deadline_at" TIMESTAMP(3),
    "sla_escalated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "review_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_context_snapshot" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "review_session_id" TEXT NOT NULL,
    "referenced_version_ids" TEXT[],
    "content_hash" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captured_by" TEXT NOT NULL,

    CONSTRAINT "review_context_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_comment" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "review_session_id" TEXT NOT NULL,
    "engineering_document_version_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "CommentSeverity" NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to_user_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "review_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_review_session_company_id" ON "review_session"("company_id");

-- CreateIndex
CREATE INDEX "idx_review_session_company_deleted" ON "review_session"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_review_session_design_package_id" ON "review_session"("design_package_id");

-- CreateIndex
CREATE INDEX "idx_review_session_task_discipline_id" ON "review_session"("task_discipline_id");

-- CreateIndex
CREATE INDEX "idx_review_session_status" ON "review_session"("status");

-- CreateIndex
CREATE INDEX "idx_review_session_assigned_to_user_id" ON "review_session"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "idx_review_session_sla_deadline_at" ON "review_session"("sla_deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_context_snapshot_review_session_id_key" ON "review_context_snapshot"("review_session_id");

-- CreateIndex
CREATE INDEX "idx_review_context_snapshot_company_id" ON "review_context_snapshot"("company_id");

-- CreateIndex
CREATE INDEX "idx_review_comment_company_id" ON "review_comment"("company_id");

-- CreateIndex
CREATE INDEX "idx_review_comment_company_deleted" ON "review_comment"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_review_comment_review_session_id" ON "review_comment"("review_session_id");

-- CreateIndex
CREATE INDEX "idx_review_comment_edv_id" ON "review_comment"("engineering_document_version_id");

-- CreateIndex
CREATE INDEX "idx_review_comment_assigned_to_user_id" ON "review_comment"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "idx_review_comment_status" ON "review_comment"("status");

-- AddForeignKey
ALTER TABLE "review_session" ADD CONSTRAINT "review_session_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_session" ADD CONSTRAINT "review_session_design_package_id_fkey" FOREIGN KEY ("design_package_id") REFERENCES "design_package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_session" ADD CONSTRAINT "review_session_task_discipline_id_fkey" FOREIGN KEY ("task_discipline_id") REFERENCES "task_discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_session" ADD CONSTRAINT "review_session_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_context_snapshot" ADD CONSTRAINT "review_context_snapshot_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_context_snapshot" ADD CONSTRAINT "review_context_snapshot_review_session_id_fkey" FOREIGN KEY ("review_session_id") REFERENCES "review_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_context_snapshot" ADD CONSTRAINT "review_context_snapshot_captured_by_fkey" FOREIGN KEY ("captured_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_review_session_id_fkey" FOREIGN KEY ("review_session_id") REFERENCES "review_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_engineering_document_version_id_fkey" FOREIGN KEY ("engineering_document_version_id") REFERENCES "engineering_document_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
