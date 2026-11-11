-- Days after the leaving date: outside employment (no pay, no absence).
ALTER TYPE "AttendanceDayStatus" ADD VALUE IF NOT EXISTS 'NOT_EMPLOYED';
