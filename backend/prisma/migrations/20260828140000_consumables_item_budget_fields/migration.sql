-- AlterTable
ALTER TABLE "consumables_requisition_item"
ADD COLUMN "model_spec" TEXT,
ADD COLUMN "unit_price" DECIMAL(14, 2),
ADD COLUMN "budget_amount" DECIMAL(14, 2);
