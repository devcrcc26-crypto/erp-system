-- Structured host contact fields (replace free-text host_contact)

ALTER TABLE "business_trip"
  ADD COLUMN IF NOT EXISTS "host_contact_name" TEXT,
  ADD COLUMN IF NOT EXISTS "host_contact_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "host_contact_email" TEXT;

UPDATE "business_trip"
SET "host_contact_name" = "host_contact"
WHERE "host_contact" IS NOT NULL AND btrim("host_contact") <> '';

ALTER TABLE "business_trip" DROP COLUMN IF EXISTS "host_contact";
