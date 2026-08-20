-- Replace single address with structured address fields on User
ALTER TABLE "user" DROP COLUMN IF EXISTS "address";

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "address_country" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "address_region" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "address_city" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "address_subcity" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "address_house_number" TEXT;
