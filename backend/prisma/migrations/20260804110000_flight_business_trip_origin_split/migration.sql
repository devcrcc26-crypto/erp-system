-- Split origin into origin_country + origin_city for flight_application and business_trip

ALTER TABLE "flight_application"
  ADD COLUMN IF NOT EXISTS "origin_country" TEXT,
  ADD COLUMN IF NOT EXISTS "origin_city" TEXT;

UPDATE "flight_application"
SET
  "origin_country" = COALESCE(NULLIF(TRIM("origin_country"), ''), 'Ethiopia'),
  "origin_city" = COALESCE(NULLIF(TRIM("origin_city"), ''), "origin")
WHERE "origin_country" IS NULL OR "origin_city" IS NULL;

ALTER TABLE "flight_application"
  ALTER COLUMN "origin_country" SET NOT NULL,
  ALTER COLUMN "origin_city" SET NOT NULL;

ALTER TABLE "flight_application"
  DROP COLUMN IF EXISTS "origin";

ALTER TABLE "business_trip"
  ADD COLUMN IF NOT EXISTS "origin_country" TEXT,
  ADD COLUMN IF NOT EXISTS "origin_city" TEXT;

UPDATE "business_trip"
SET
  "origin_country" = COALESCE(NULLIF(TRIM("origin_country"), ''), 'Ethiopia'),
  "origin_city" = COALESCE(NULLIF(TRIM("origin_city"), ''), "origin")
WHERE "origin_country" IS NULL OR "origin_city" IS NULL;

ALTER TABLE "business_trip"
  ALTER COLUMN "origin_country" SET NOT NULL,
  ALTER COLUMN "origin_city" SET NOT NULL;

ALTER TABLE "business_trip"
  DROP COLUMN IF EXISTS "origin";
