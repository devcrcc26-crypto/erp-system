-- Replace single emergency contact name with structured name + email fields
ALTER TABLE "user" DROP COLUMN IF EXISTS "emergency_contact_name";

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emergency_contact_first_name" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emergency_contact_middle_name" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emergency_contact_last_name" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emergency_contact_email" TEXT;
