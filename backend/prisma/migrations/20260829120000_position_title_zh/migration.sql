-- Optional Chinese title for positions (mirrors department.name_zh).
ALTER TABLE "position" ADD COLUMN IF NOT EXISTS "title_zh" TEXT;
