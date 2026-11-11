-- Full-name OA login + password-change enforcement + lockout fields.
-- Email column is already nullable; no data UPDATE in this migration.
-- Table map: User → "user"

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "login_name" TEXT,
  ADD COLUMN IF NOT EXISTS "login_name_normalized" TEXT,
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_login_name"
  ON "user" ("login_name");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_login_name_normalized"
  ON "user" ("login_name_normalized");
