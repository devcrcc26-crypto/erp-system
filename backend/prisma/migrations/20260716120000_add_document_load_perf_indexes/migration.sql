-- Performance: reduce document/review-mode load latency (Fix 15).
-- Non-CONCURRENTLY so `prisma migrate deploy` can apply on fresh local DBs
-- (Prisma wraps migrations in a transaction; CONCURRENTLY cannot run inside one).

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_engineering_document_task_discipline_deleted"
  ON "public"."engineering_document" ("task_discipline_id", "deleted_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_engineering_document_version_document_deleted"
  ON "public"."engineering_document_version" ("engineering_document_id", "deleted_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_engineering_document_version_document_current_deleted"
  ON "public"."engineering_document_version" ("engineering_document_id", "is_current", "deleted_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_document_folder_context_deleted"
  ON "public"."document_folder" ("context_type", "context_id", "deleted_at");
