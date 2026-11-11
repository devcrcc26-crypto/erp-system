-- Flag when site/WFH/leave approval cannot update an APPROVED attendance month
ALTER TABLE "attendance_monthly_approval"
  ADD COLUMN IF NOT EXISTS "attendance_recalc_stale" BOOLEAN NOT NULL DEFAULT false;

-- Origin for WFH days created from the not-in-attendance-file flow
ALTER TABLE "work_from_home_day"
  ADD COLUMN IF NOT EXISTS "created_from_attendance_import" BOOLEAN NOT NULL DEFAULT false;
