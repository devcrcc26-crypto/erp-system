-- AttendanceMatchMethod: month matched via approved site/WFH/leave coverage (not manual present)
ALTER TYPE "AttendanceMatchMethod" ADD VALUE IF NOT EXISTS 'COVERED';

-- AttendanceMissingResolution: auto-resolved when all working days are covered
ALTER TYPE "AttendanceMissingResolution" ADD VALUE IF NOT EXISTS 'COVERED';

ALTER TABLE "site_assignment"
  ADD COLUMN IF NOT EXISTS "created_from_attendance_import" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "payroll_run"
  ADD COLUMN IF NOT EXISTS "attendance_snapshot_stale" BOOLEAN NOT NULL DEFAULT false;
