-- Performance: reduce document/review-mode load latency (Fix 15).
-- CONCURRENTLY avoids locking these tables on the live database; Prisma
-- runs migrations containing CONCURRENTLY outside its transaction wrapper.

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_engineering_document_task_discipline_deleted"
  ON "public"."engineering_document" ("task_discipline_id", "deleted_at");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_engineering_document_version_document_deleted"
  ON "public"."engineering_document_version" ("engineering_document_id", "deleted_at");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_engineering_document_version_document_current_deleted"
  ON "public"."engineering_document_version" ("engineering_document_id", "is_current", "deleted_at");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_document_folder_context_deleted"
  ON "public"."document_folder" ("context_type", "context_id", "deleted_at");
