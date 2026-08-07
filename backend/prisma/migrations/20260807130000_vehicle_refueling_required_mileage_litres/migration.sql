-- Align vehicle_refueling mileage/litres with required columns
UPDATE "vehicle_refueling"
SET "current_mileage" = 0
WHERE "current_mileage" IS NULL;

UPDATE "vehicle_refueling"
SET "requested_litres" = 0
WHERE "requested_litres" IS NULL;

ALTER TABLE "vehicle_refueling"
  ALTER COLUMN "current_mileage" SET NOT NULL,
  ALTER COLUMN "requested_litres" SET NOT NULL;
