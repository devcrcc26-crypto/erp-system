-- Odometer readings do not apply to air travel.
-- Clear existing values first (2 flight applications held km data), then drop the columns.
UPDATE "flight_application"
SET "km_at_departure" = NULL, "km_at_return" = NULL
WHERE "km_at_departure" IS NOT NULL OR "km_at_return" IS NOT NULL;

UPDATE "business_trip"
SET "km_at_departure" = NULL, "km_at_return" = NULL
WHERE "km_at_departure" IS NOT NULL OR "km_at_return" IS NOT NULL;

ALTER TABLE "flight_application"
DROP COLUMN "km_at_departure",
DROP COLUMN "km_at_return";

ALTER TABLE "business_trip"
DROP COLUMN "km_at_departure",
DROP COLUMN "km_at_return";
