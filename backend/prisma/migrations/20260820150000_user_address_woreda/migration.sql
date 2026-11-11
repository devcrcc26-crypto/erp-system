-- Add dedicated Woreda field on User address
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "address_woreda" TEXT;
