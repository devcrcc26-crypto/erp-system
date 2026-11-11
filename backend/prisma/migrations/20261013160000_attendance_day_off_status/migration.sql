-- Schedule-aware day off statuses (replaces calendar-Sunday-only SUNDAY for new writes).
ALTER TYPE "AttendanceDayStatus" ADD VALUE IF NOT EXISTS 'DAY_OFF';
ALTER TYPE "AttendanceDayStatus" ADD VALUE IF NOT EXISTS 'WORKED_ON_DAY_OFF';
