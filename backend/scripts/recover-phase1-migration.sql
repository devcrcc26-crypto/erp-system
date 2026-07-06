-- Run once if 20260706110000_phase1_department_project_fk failed mid-flight.
ALTER TABLE "department" DROP CONSTRAINT IF EXISTS "department_leader_user_id_fkey";
ALTER TABLE "department" DROP COLUMN IF EXISTS "leader_user_id";
ALTER TABLE "project" DROP CONSTRAINT IF EXISTS "project_department_id_fkey";
ALTER TABLE "project" DROP COLUMN IF EXISTS "department_id";
