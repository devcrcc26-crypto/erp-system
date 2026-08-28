-- RenameColumn
ALTER TABLE "vehicle_refueling"
RENAME COLUMN "estimated_cost_etb" TO "total_cost_etb";

-- AlterTable
ALTER TABLE "vehicle_refueling"
ADD COLUMN "unit_price_etb" DECIMAL(10, 2);
