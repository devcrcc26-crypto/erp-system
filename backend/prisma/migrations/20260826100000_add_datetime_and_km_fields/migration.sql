-- Convert date columns to timestamp (existing rows keep midnight) and add km / totalDays fields.

ALTER TABLE "flight_application"
  ALTER COLUMN "departure_date" TYPE TIMESTAMP
  USING "departure_date"::timestamp;

ALTER TABLE "flight_application"
  ALTER COLUMN "return_date" TYPE TIMESTAMP
  USING "return_date"::timestamp;

ALTER TABLE "flight_application"
  ADD COLUMN IF NOT EXISTS "km_at_departure" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "km_at_return" DECIMAL(12, 2);

ALTER TABLE "business_trip"
  ALTER COLUMN "departure_date" TYPE TIMESTAMP
  USING "departure_date"::timestamp;

ALTER TABLE "business_trip"
  ALTER COLUMN "return_date" TYPE TIMESTAMP
  USING "return_date"::timestamp;

ALTER TABLE "business_trip"
  ADD COLUMN IF NOT EXISTS "km_at_departure" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "km_at_return" DECIMAL(12, 2);

ALTER TABLE "per_diem_request"
  ALTER COLUMN "start_date" TYPE TIMESTAMP
  USING "start_date"::timestamp;

ALTER TABLE "per_diem_request"
  ALTER COLUMN "end_date" TYPE TIMESTAMP
  USING "end_date"::timestamp;

ALTER TABLE "per_diem_request"
  ADD COLUMN IF NOT EXISTS "total_days" INTEGER;

UPDATE "per_diem_request"
SET "total_days" = "days"
WHERE "total_days" IS NULL;
