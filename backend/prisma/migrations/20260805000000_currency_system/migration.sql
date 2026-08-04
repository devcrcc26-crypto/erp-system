-- Supported currencies
CREATE TYPE "SupportedCurrency" AS ENUM ('ETB', 'USD', 'CNY');

-- Daily exchange rate cache
CREATE TABLE "exchange_rate" (
  "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"    TEXT NOT NULL REFERENCES "company"("id"),
  "base_currency" "SupportedCurrency" NOT NULL DEFAULT 'ETB',
  "from_currency" "SupportedCurrency" NOT NULL,
  "to_currency"   "SupportedCurrency" NOT NULL DEFAULT 'ETB',
  "rate"          NUMERIC(18, 6) NOT NULL,
  "fetched_at"    DATE NOT NULL DEFAULT CURRENT_DATE,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("company_id", "from_currency", "to_currency", "fetched_at")
);

-- Per diem destination categories (HR configures)
CREATE TABLE "per_diem_rate" (
  "id"                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"            TEXT NOT NULL REFERENCES "company"("id"),
  "destination_category"  TEXT NOT NULL,
  "daily_rate"            NUMERIC(12, 2) NOT NULL,
  "currency"              "SupportedCurrency" NOT NULL DEFAULT 'ETB',
  "description"           TEXT,
  "is_active"              BOOLEAN NOT NULL DEFAULT true,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"            TEXT NOT NULL REFERENCES "user"("id"),
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"            TEXT NOT NULL REFERENCES "user"("id"),
  "deleted_at"            TIMESTAMP(3),
  "deleted_by"            TEXT,
  UNIQUE ("company_id", "destination_category")
);

CREATE INDEX "idx_exchange_rate_company" ON "exchange_rate"("company_id");
CREATE INDEX "idx_per_diem_rate_company" ON "per_diem_rate"("company_id");
