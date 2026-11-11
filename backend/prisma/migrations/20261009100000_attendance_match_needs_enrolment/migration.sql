-- "Needs enrolment" creates a counted-present attendance record for an
-- employee not yet enrolled on the attendance machine.
ALTER TYPE "AttendanceMatchMethod" ADD VALUE IF NOT EXISTS 'NEEDS_ENROLMENT';
