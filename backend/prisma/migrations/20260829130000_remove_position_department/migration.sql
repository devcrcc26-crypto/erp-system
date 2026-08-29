-- Positions are company-level job titles; department belongs on the user, not the position.
ALTER TABLE "position" DROP CONSTRAINT IF EXISTS "position_department_id_fkey";
DROP INDEX IF EXISTS "idx_position_department_id";
ALTER TABLE "position" DROP COLUMN IF EXISTS "department_id";
