-- Announcements: company news (HR) and system "What's new" posts, with
-- per-recipient read / acknowledgement tracking snapshotted on publish.

-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('COMPANY', 'SYSTEM_UPDATE');

-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AnnouncementScope" AS ENUM ('ALL', 'DEPARTMENTS', 'DISCIPLINES', 'ROLES', 'EMPLOYEES');

-- AlterEnum
ALTER TYPE "FolderContextType" ADD VALUE 'ANNOUNCEMENT';

-- CreateTable
CREATE TABLE "announcement" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "AnnouncementType" NOT NULL DEFAULT 'COMPANY',
    "title" TEXT NOT NULL,
    "title_zh" TEXT,
    "body" TEXT NOT NULL,
    "body_zh" TEXT,
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "audience_scope" "AnnouncementScope" NOT NULL DEFAULT 'ALL',
    "department_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "discipline_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "role_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "employee_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "require_acknowledgement" BOOLEAN NOT NULL DEFAULT false,
    "send_email" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publish_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "content_edited_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "attachment_folder_id" TEXT,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_recipient" (
    "id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_announcement_company_status" ON "announcement"("company_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_announcement_company_type" ON "announcement"("company_id", "type", "status");

-- CreateIndex
CREATE INDEX "idx_announcement_due" ON "announcement"("status", "publish_at");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_company_id_number_key" ON "announcement"("company_id", "number");

-- CreateIndex
CREATE INDEX "idx_announcement_recipient_user_read" ON "announcement_recipient"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_recipient_announcement_id_user_id_key" ON "announcement_recipient"("announcement_id", "user_id");

-- AddForeignKey
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_attachment_folder_id_fkey" FOREIGN KEY ("attachment_folder_id") REFERENCES "document_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_recipient" ADD CONSTRAINT "announcement_recipient_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_recipient" ADD CONSTRAINT "announcement_recipient_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AN-0001 numbering
CREATE SEQUENCE IF NOT EXISTS "announcement_number_seq";
