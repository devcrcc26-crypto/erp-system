-- Add optional Chinese full name for users (e.g. Chinese site workers).
ALTER TABLE "user" ADD COLUMN "chinese_name" TEXT;

-- Make email optional. Users without an email are record-only:
-- they cannot log in or use any email-dependent flow (login, password reset,
-- activation, email change). The composite unique index below allows multiple
-- NULL emails per company (PostgreSQL treats NULLs as distinct).
ALTER TABLE "user" ALTER COLUMN "email" DROP NOT NULL;
