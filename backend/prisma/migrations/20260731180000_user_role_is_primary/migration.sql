-- AlterTable
ALTER TABLE "user_role"
ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: first assignment per user becomes primary
UPDATE "user_role" AS ur
SET "is_primary" = true
WHERE ur.id IN (
  SELECT DISTINCT ON ("user_id") id
  FROM "user_role"
  WHERE "deleted_at" IS NULL
  ORDER BY "user_id", "created_at" ASC
);

-- At most one active primary role per user
CREATE UNIQUE INDEX "idx_user_role_primary"
  ON "user_role"("user_id")
  WHERE "is_primary" = true AND "deleted_at" IS NULL;
