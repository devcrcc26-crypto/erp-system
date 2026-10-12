-- Approved leave with HQ scans: HR review flag (no pay change; leave unchanged).
ALTER TYPE "AttendanceDayFlag" ADD VALUE IF NOT EXISTS 'ON_LEAVE_BUT_SCANNED';
