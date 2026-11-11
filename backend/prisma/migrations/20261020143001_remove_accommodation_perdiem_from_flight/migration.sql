-- Remove accommodationRequired, accommodationDetails, perDiemRequired from flight_application
ALTER TABLE "flight_application" DROP COLUMN IF EXISTS "accommodation_required";
ALTER TABLE "flight_application" DROP COLUMN IF EXISTS "accommodation_details";
ALTER TABLE "flight_application" DROP COLUMN IF EXISTS "per_diem_required";
