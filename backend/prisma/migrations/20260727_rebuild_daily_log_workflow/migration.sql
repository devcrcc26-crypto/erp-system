-- Rebuild daily_log workflow fields, enums, and materials child table.

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DailyLogStatus') THEN
    CREATE TYPE "DailyLogStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RainfallLevel') THEN
    CREATE TYPE "RainfallLevel" AS ENUM ('NONE', 'LIGHT', 'MODERATE', 'HEAVY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WeatherCondition') THEN
    CREATE TYPE "WeatherCondition" AS ENUM (
      'SUNNY', 'PARTLY_CLOUDY', 'OVERCAST', 'LIGHT_RAIN', 'HEAVY_RAIN',
      'THUNDERSTORM', 'FOGGY', 'WINDY', 'HOT_AND_DRY'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VisitorPurpose') THEN
    CREATE TYPE "VisitorPurpose" AS ENUM (
      'CLIENT_VISIT', 'INSPECTION', 'DELIVERY', 'CONSULTANT_VISIT',
      'REGULATORY_AUTHORITY', 'OTHER'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IncidentType') THEN
    CREATE TYPE "IncidentType" AS ENUM (
      'SAFETY_VIOLATION', 'NEAR_MISS', 'FIRST_AID', 'MEDICAL_TREATMENT',
      'LOST_TIME_INJURY', 'PROPERTY_DAMAGE', 'ENVIRONMENTAL', 'OTHER'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IncidentSeverity') THEN
    CREATE TYPE "IncidentSeverity" AS ENUM (
      'MINOR', 'MODERATE', 'MAJOR', 'CRITICAL', 'NEAR_MISS'
    );
  END IF;
END $$;

-- Main log columns
ALTER TABLE "daily_log"
  ADD COLUMN IF NOT EXISTS "company_id" TEXT,
  ADD COLUMN IF NOT EXISTS "log_number" TEXT,
  ADD COLUMN IF NOT EXISTS "contractor_name" TEXT,
  ADD COLUMN IF NOT EXISTS "supervisor_id" TEXT,
  ADD COLUMN IF NOT EXISTS "supervised_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submitted_by" TEXT,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approved_by" TEXT,
  ADD COLUMN IF NOT EXISTS "rainfall_level" "RainfallLevel",
  ADD COLUMN IF NOT EXISTS "workforce_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "humidity" DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS "issues" TEXT,
  ADD COLUMN IF NOT EXISTS "delays" TEXT;

UPDATE "daily_log" dl
SET "company_id" = p."company_id"
FROM "project" p
WHERE p."id" = dl."project_id"
  AND dl."company_id" IS NULL;

ALTER TABLE "daily_log"
  ALTER COLUMN "company_id" SET NOT NULL;

-- Rename work_summary → work_description
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_log' AND column_name = 'work_summary'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_log' AND column_name = 'work_description'
  ) THEN
    ALTER TABLE "daily_log" RENAME COLUMN "work_summary" TO "work_description";
  END IF;
END $$;

-- Convert weather_condition to enum (unknown values → SUNNY)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_log'
      AND column_name = 'weather_condition'
      AND udt_name <> 'WeatherCondition'
  ) THEN
    ALTER TABLE "daily_log"
      ALTER COLUMN "weather_condition" DROP DEFAULT;

    ALTER TABLE "daily_log"
      ALTER COLUMN "weather_condition" TYPE "WeatherCondition"
      USING (
        CASE UPPER(REPLACE(COALESCE("weather_condition", ''), ' ', '_'))
          WHEN 'SUNNY' THEN 'SUNNY'::"WeatherCondition"
          WHEN 'PARTLY_CLOUDY' THEN 'PARTLY_CLOUDY'::"WeatherCondition"
          WHEN 'OVERCAST' THEN 'OVERCAST'::"WeatherCondition"
          WHEN 'LIGHT_RAIN' THEN 'LIGHT_RAIN'::"WeatherCondition"
          WHEN 'HEAVY_RAIN' THEN 'HEAVY_RAIN'::"WeatherCondition"
          WHEN 'THUNDERSTORM' THEN 'THUNDERSTORM'::"WeatherCondition"
          WHEN 'FOGGY' THEN 'FOGGY'::"WeatherCondition"
          WHEN 'WINDY' THEN 'WINDY'::"WeatherCondition"
          WHEN 'HOT_AND_DRY' THEN 'HOT_AND_DRY'::"WeatherCondition"
          ELSE NULL
        END
      );
  END IF;
END $$;

-- Convert status to DailyLogStatus enum
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_log'
      AND column_name = 'status'
      AND udt_name <> 'DailyLogStatus'
  ) THEN
    ALTER TABLE "daily_log"
      ALTER COLUMN "status" DROP DEFAULT;

    ALTER TABLE "daily_log"
      ALTER COLUMN "status" TYPE "DailyLogStatus"
      USING (
        CASE UPPER(COALESCE("status", 'DRAFT'))
          WHEN 'SUBMITTED' THEN 'SUBMITTED'::"DailyLogStatus"
          WHEN 'APPROVED' THEN 'APPROVED'::"DailyLogStatus"
          ELSE 'DRAFT'::"DailyLogStatus"
        END
      );

    ALTER TABLE "daily_log"
      ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"DailyLogStatus";
  END IF;
END $$;

-- Drop legacy free-text equipment/materials narrative columns (moved to child tables)
ALTER TABLE "daily_log" DROP COLUMN IF EXISTS "equipment";
ALTER TABLE "daily_log" DROP COLUMN IF EXISTS "materials";

-- Indexes + FKs
CREATE INDEX IF NOT EXISTS "idx_daily_log_company_id" ON "daily_log"("company_id");
CREATE INDEX IF NOT EXISTS "idx_daily_log_company_deleted" ON "daily_log"("company_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "idx_daily_log_supervisor_id" ON "daily_log"("supervisor_id");
CREATE INDEX IF NOT EXISTS "idx_daily_log_submitted_by" ON "daily_log"("submitted_by");
CREATE INDEX IF NOT EXISTS "idx_daily_log_approved_by" ON "daily_log"("approved_by");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_log_company_id_fkey') THEN
    ALTER TABLE "daily_log"
      ADD CONSTRAINT "daily_log_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "company"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_log_supervisor_id_fkey') THEN
    ALTER TABLE "daily_log"
      ADD CONSTRAINT "daily_log_supervisor_id_fkey"
      FOREIGN KEY ("supervisor_id") REFERENCES "user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_log_submitted_by_fkey') THEN
    ALTER TABLE "daily_log"
      ADD CONSTRAINT "daily_log_submitted_by_fkey"
      FOREIGN KEY ("submitted_by") REFERENCES "user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_log_approved_by_fkey') THEN
    ALTER TABLE "daily_log"
      ADD CONSTRAINT "daily_log_approved_by_fkey"
      FOREIGN KEY ("approved_by") REFERENCES "user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Convert visitor purpose / incident type+severity when possible
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_log_visitor'
      AND column_name = 'purpose'
      AND udt_name <> 'VisitorPurpose'
  ) THEN
    ALTER TABLE "daily_log_visitor"
      ALTER COLUMN "purpose" TYPE "VisitorPurpose"
      USING (
        CASE UPPER(REPLACE(COALESCE("purpose", ''), ' ', '_'))
          WHEN 'CLIENT_VISIT' THEN 'CLIENT_VISIT'::"VisitorPurpose"
          WHEN 'INSPECTION' THEN 'INSPECTION'::"VisitorPurpose"
          WHEN 'DELIVERY' THEN 'DELIVERY'::"VisitorPurpose"
          WHEN 'CONSULTANT_VISIT' THEN 'CONSULTANT_VISIT'::"VisitorPurpose"
          WHEN 'REGULATORY_AUTHORITY' THEN 'REGULATORY_AUTHORITY'::"VisitorPurpose"
          WHEN 'OTHER' THEN 'OTHER'::"VisitorPurpose"
          WHEN '' THEN NULL
          ELSE 'OTHER'::"VisitorPurpose"
        END
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_log_incident'
      AND column_name = 'incident_type'
      AND udt_name <> 'IncidentType'
  ) THEN
    ALTER TABLE "daily_log_incident"
      ALTER COLUMN "incident_type" TYPE "IncidentType"
      USING (
        CASE UPPER(REPLACE(COALESCE("incident_type", ''), ' ', '_'))
          WHEN 'SAFETY_VIOLATION' THEN 'SAFETY_VIOLATION'::"IncidentType"
          WHEN 'NEAR_MISS' THEN 'NEAR_MISS'::"IncidentType"
          WHEN 'FIRST_AID' THEN 'FIRST_AID'::"IncidentType"
          WHEN 'MEDICAL_TREATMENT' THEN 'MEDICAL_TREATMENT'::"IncidentType"
          WHEN 'LOST_TIME_INJURY' THEN 'LOST_TIME_INJURY'::"IncidentType"
          WHEN 'PROPERTY_DAMAGE' THEN 'PROPERTY_DAMAGE'::"IncidentType"
          WHEN 'ENVIRONMENTAL' THEN 'ENVIRONMENTAL'::"IncidentType"
          ELSE 'OTHER'::"IncidentType"
        END
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_log_incident'
      AND column_name = 'severity'
      AND udt_name <> 'IncidentSeverity'
  ) THEN
    ALTER TABLE "daily_log_incident"
      ALTER COLUMN "severity" TYPE "IncidentSeverity"
      USING (
        CASE UPPER(REPLACE(COALESCE("severity", ''), ' ', '_'))
          WHEN 'MINOR' THEN 'MINOR'::"IncidentSeverity"
          WHEN 'MODERATE' THEN 'MODERATE'::"IncidentSeverity"
          WHEN 'MAJOR' THEN 'MAJOR'::"IncidentSeverity"
          WHEN 'CRITICAL' THEN 'CRITICAL'::"IncidentSeverity"
          WHEN 'NEAR_MISS' THEN 'NEAR_MISS'::"IncidentSeverity"
          WHEN 'LOW' THEN 'MINOR'::"IncidentSeverity"
          WHEN 'MEDIUM' THEN 'MODERATE'::"IncidentSeverity"
          WHEN 'HIGH' THEN 'MAJOR'::"IncidentSeverity"
          ELSE NULL
        END
      );
  END IF;
END $$;

-- Materials child table
CREATE TABLE IF NOT EXISTS "daily_log_material" (
  "id" TEXT PRIMARY KEY,
  "daily_log_id" TEXT NOT NULL REFERENCES "daily_log"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "material_type" TEXT NOT NULL,
  "quantity" DECIMAL(12, 3) NOT NULL,
  "unit" TEXT NOT NULL,
  "supplier" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_daily_log_material_log_id"
  ON "daily_log_material"("daily_log_id");
