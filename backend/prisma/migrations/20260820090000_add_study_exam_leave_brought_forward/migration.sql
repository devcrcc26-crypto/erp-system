-- Study/exam leave types and brought-forward balance field.

ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'STUDY';
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'EXAM';

ALTER TABLE "leave_balance"
  ADD COLUMN IF NOT EXISTS "brought_forward" DECIMAL(4,1) NOT NULL DEFAULT 0;

ALTER TABLE "leave_balance" DROP COLUMN IF EXISTS "remaining";

ALTER TABLE "leave_balance"
  ADD COLUMN "remaining" DECIMAL(4,1) GENERATED ALWAYS AS (((entitled + brought_forward) - used) - pending) STORED;
