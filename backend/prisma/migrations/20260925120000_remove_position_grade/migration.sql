-- Remove unused position grade column.
ALTER TABLE "position" DROP COLUMN IF EXISTS "grade";
