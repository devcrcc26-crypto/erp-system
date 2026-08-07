-- CreateEnum: VehicleType
CREATE TYPE "VehicleType" AS ENUM (
  'CAR', 'TRUCK', 'VAN', 'BUS', 'PICKUP', 'MOTORCYCLE', 'OTHER'
);

-- CreateEnum: VehicleStatus
CREATE TYPE "VehicleStatus" AS ENUM (
  'AVAILABLE', 'APPROVED', 'IN_USE', 'MAINTENANCE', 'RETIRED'
);

-- CreateEnum: FuelType
CREATE TYPE "FuelType" AS ENUM (
  'PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID'
);

-- CreateTable
CREATE TABLE "company_vehicle" (
  "id"                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"         TEXT NOT NULL REFERENCES "company"("id"),
  "plate_number"       TEXT NOT NULL,
  "vehicle_type"       "VehicleType" NOT NULL,
  "make"               TEXT NOT NULL,
  "model"              TEXT NOT NULL,
  "year"               INTEGER NOT NULL,
  "fuel_type"          "FuelType" NOT NULL DEFAULT 'DIESEL',
  "color"              TEXT,
  "assigned_driver_id" TEXT REFERENCES "user"("id"),
  "status"             "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
  "notes"              TEXT,
  "is_active"          BOOLEAN NOT NULL DEFAULT true,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"         TEXT NOT NULL REFERENCES "user"("id"),
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"         TEXT NOT NULL,
  "deleted_at"         TIMESTAMP(3),
  "deleted_by"         TEXT,
  UNIQUE ("company_id", "plate_number")
);

-- CreateIndexes
CREATE INDEX "idx_company_vehicle_company" ON "company_vehicle"("company_id");
CREATE INDEX "idx_company_vehicle_company_deleted" ON "company_vehicle"("company_id", "deleted_at");
CREATE INDEX "idx_company_vehicle_status" ON "company_vehicle"("status");
CREATE INDEX "idx_company_vehicle_assigned_driver" ON "company_vehicle"("assigned_driver_id");
