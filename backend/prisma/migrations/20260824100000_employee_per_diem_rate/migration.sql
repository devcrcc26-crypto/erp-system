-- Replace company-wide per_diem_rate with per-employee employee_per_diem_rate.

CREATE TABLE "employee_per_diem_rate" (
  "id"                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"          TEXT NOT NULL REFERENCES "company"("id"),
  "employee_id"         TEXT NOT NULL UNIQUE REFERENCES "user"("id"),
  "americas_rate"       NUMERIC(12, 2),
  "asia_rate"           NUMERIC(12, 2),
  "domestic_rate"       NUMERIC(12, 2),
  "east_africa_rate"    NUMERIC(12, 2),
  "europe_rate"         NUMERIC(12, 2),
  "middle_east_rate"    NUMERIC(12, 2),
  "other_africa_rate"   NUMERIC(12, 2),
  "americas_active"     BOOLEAN NOT NULL DEFAULT true,
  "asia_active"         BOOLEAN NOT NULL DEFAULT true,
  "domestic_active"     BOOLEAN NOT NULL DEFAULT true,
  "east_africa_active"  BOOLEAN NOT NULL DEFAULT true,
  "europe_active"       BOOLEAN NOT NULL DEFAULT true,
  "middle_east_active"  BOOLEAN NOT NULL DEFAULT true,
  "other_africa_active" BOOLEAN NOT NULL DEFAULT true,
  "currency"            "SupportedCurrency" NOT NULL DEFAULT 'ETB',
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"          TEXT NOT NULL REFERENCES "user"("id"),
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"          TEXT NOT NULL REFERENCES "user"("id"),
  "deleted_at"          TIMESTAMP(3),
  "deleted_by"          TEXT,
  UNIQUE ("company_id", "employee_id")
);

CREATE INDEX "idx_employee_per_diem_rate_company"
  ON "employee_per_diem_rate"("company_id");
CREATE INDEX "idx_employee_per_diem_rate_company_deleted"
  ON "employee_per_diem_rate"("company_id", "deleted_at");
CREATE INDEX "idx_employee_per_diem_rate_employee"
  ON "employee_per_diem_rate"("employee_id");

-- Migrate legacy company rates into one row per active employee (before dropping per_diem_rate).
INSERT INTO "employee_per_diem_rate" (
  "id",
  "company_id",
  "employee_id",
  "americas_rate",
  "asia_rate",
  "domestic_rate",
  "east_africa_rate",
  "europe_rate",
  "middle_east_rate",
  "other_africa_rate",
  "americas_active",
  "asia_active",
  "domestic_active",
  "east_africa_active",
  "europe_active",
  "middle_east_active",
  "other_africa_active",
  "currency",
  "created_by",
  "updated_by"
)
SELECT
  gen_random_uuid()::text,
  u."company_id",
  u."id",
  (SELECT r."daily_rate" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'Americas'
      AND r."deleted_at" IS NULL
    LIMIT 1),
  (SELECT r."daily_rate" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'Asia'
      AND r."deleted_at" IS NULL
    LIMIT 1),
  (SELECT r."daily_rate" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'Domestic'
      AND r."deleted_at" IS NULL
    LIMIT 1),
  (SELECT r."daily_rate" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'East Africa'
      AND r."deleted_at" IS NULL
    LIMIT 1),
  (SELECT r."daily_rate" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'Europe'
      AND r."deleted_at" IS NULL
    LIMIT 1),
  (SELECT r."daily_rate" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'Middle East'
      AND r."deleted_at" IS NULL
    LIMIT 1),
  (SELECT r."daily_rate" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'Other Africa'
      AND r."deleted_at" IS NULL
    LIMIT 1),
  COALESCE((SELECT r."is_active" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'Americas'
      AND r."deleted_at" IS NULL
    LIMIT 1), true),
  COALESCE((SELECT r."is_active" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'Asia'
      AND r."deleted_at" IS NULL
    LIMIT 1), true),
  COALESCE((SELECT r."is_active" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'Domestic'
      AND r."deleted_at" IS NULL
    LIMIT 1), true),
  COALESCE((SELECT r."is_active" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'East Africa'
      AND r."deleted_at" IS NULL
    LIMIT 1), true),
  COALESCE((SELECT r."is_active" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'Europe'
      AND r."deleted_at" IS NULL
    LIMIT 1), true),
  COALESCE((SELECT r."is_active" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'Middle East'
      AND r."deleted_at" IS NULL
    LIMIT 1), true),
  COALESCE((SELECT r."is_active" FROM "per_diem_rate" r
    WHERE r."company_id" = u."company_id"
      AND r."destination_category" = 'Other Africa'
      AND r."deleted_at" IS NULL
    LIMIT 1), true),
  COALESCE(
    (SELECT r."currency" FROM "per_diem_rate" r
      WHERE r."company_id" = u."company_id"
        AND r."destination_category" = 'Domestic'
        AND r."deleted_at" IS NULL
      LIMIT 1),
    'ETB'::"SupportedCurrency"
  ),
  u."id",
  u."id"
FROM "user" u
WHERE u."deleted_at" IS NULL
ON CONFLICT ("company_id", "employee_id") DO NOTHING;

-- Drop legacy FK from per_diem_request → per_diem_rate, add new column + FK.
ALTER TABLE "per_diem_request" DROP CONSTRAINT IF EXISTS "per_diem_request_per_diem_rate_id_fkey";
ALTER TABLE "per_diem_request" DROP COLUMN IF EXISTS "per_diem_rate_id";

ALTER TABLE "per_diem_request"
  ADD COLUMN "employee_per_diem_rate_id" TEXT REFERENCES "employee_per_diem_rate"("id");

-- Backfill request FK where employee already has a migrated rate row.
UPDATE "per_diem_request" pdr
SET "employee_per_diem_rate_id" = epr."id"
FROM "employee_per_diem_rate" epr
WHERE epr."employee_id" = pdr."employee_id"
  AND epr."company_id" = pdr."company_id"
  AND epr."deleted_at" IS NULL
  AND pdr."employee_per_diem_rate_id" IS NULL;

DROP TABLE IF EXISTS "per_diem_rate";
