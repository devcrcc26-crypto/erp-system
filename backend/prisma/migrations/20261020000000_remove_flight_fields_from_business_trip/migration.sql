-- Remove flight-specific fields from business_trip table

-- Generated column must be dropped before columns it references
ALTER TABLE "business_trip"
  DROP COLUMN IF EXISTS "estimated_total_cost";

ALTER TABLE "business_trip"
  DROP COLUMN IF EXISTS "ticket_class",
  DROP COLUMN IF EXISTS "estimated_flight_cost",
  DROP COLUMN IF EXISTS "accommodation_required",
  DROP COLUMN IF EXISTS "accommodation_details",
  DROP COLUMN IF EXISTS "per_diem_required",
  DROP COLUMN IF EXISTS "per_diem_category";

ALTER TABLE "business_trip"
  ADD COLUMN "estimated_total_cost" DECIMAL(12,2)
    GENERATED ALWAYS AS (
      COALESCE(estimated_accommodation_cost, 0) +
      COALESCE(estimated_per_diem, 0) +
      COALESCE(estimated_other_cost, 0)
    ) STORED;
