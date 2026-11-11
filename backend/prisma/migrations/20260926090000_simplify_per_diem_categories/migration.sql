-- Simplify employee per diem destination categories to Domestic / Regional / International.
-- Preserve existing rates: East Africa → Regional; other regions → International (max).

ALTER TABLE "employee_per_diem_rate"
  ADD COLUMN IF NOT EXISTS "regional_rate" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "international_rate" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "regional_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "international_active" BOOLEAN NOT NULL DEFAULT true;

UPDATE "employee_per_diem_rate"
SET
  "regional_rate" = "east_africa_rate",
  "regional_active" = "east_africa_active",
  "international_rate" = GREATEST(
    COALESCE("europe_rate", 0),
    COALESCE("americas_rate", 0),
    COALESCE("asia_rate", 0),
    COALESCE("middle_east_rate", 0),
    COALESCE("other_africa_rate", 0)
  ),
  "international_active" = true;

UPDATE "per_diem_request"
SET "destination_category" = CASE
  WHEN "destination_category" = 'Domestic' THEN 'Domestic'
  WHEN "destination_category" IN ('East Africa') THEN 'Regional'
  WHEN "destination_category" IN (
    'Americas',
    'Asia',
    'Europe',
    'Middle East',
    'Other Africa'
  ) THEN 'International'
  ELSE "destination_category"
END
WHERE "deleted_at" IS NULL;

ALTER TABLE "employee_per_diem_rate"
  DROP COLUMN IF EXISTS "americas_rate",
  DROP COLUMN IF EXISTS "asia_rate",
  DROP COLUMN IF EXISTS "east_africa_rate",
  DROP COLUMN IF EXISTS "europe_rate",
  DROP COLUMN IF EXISTS "middle_east_rate",
  DROP COLUMN IF EXISTS "other_africa_rate",
  DROP COLUMN IF EXISTS "americas_active",
  DROP COLUMN IF EXISTS "asia_active",
  DROP COLUMN IF EXISTS "east_africa_active",
  DROP COLUMN IF EXISTS "europe_active",
  DROP COLUMN IF EXISTS "middle_east_active",
  DROP COLUMN IF EXISTS "other_africa_active";
