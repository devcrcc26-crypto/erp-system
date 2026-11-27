-- Manual correction lines (per-line direction / tax treatment), settlement-only
-- payroll rows, reconciliation receipts, and a "Missed bonus" adjustment type.

-- AlterTable: manual correction lines choose direction and tax treatment per line.
ALTER TABLE "payroll_adjustment_line"
  ADD COLUMN "kind_override" "payroll_adjustment_kind",
  ADD COLUMN "taxable_override" BOOLEAN,
  ADD COLUMN "is_correction_line" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: settlement-only rows of a regular run.
ALTER TABLE "payroll_entry"
  ADD COLUMN "settlement_only" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: money collected outside payroll against a reconciliation item.
CREATE TABLE "payroll_reconciliation_receipt" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "reconciliation_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "received_on" DATE NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "note" VARCHAR(500),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_reconciliation_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_payroll_reconciliation_receipt_item" ON "payroll_reconciliation_receipt"("reconciliation_id");

-- CreateIndex
CREATE INDEX "idx_payroll_reconciliation_receipt_company" ON "payroll_reconciliation_receipt"("company_id");

-- AddForeignKey
ALTER TABLE "payroll_reconciliation_receipt" ADD CONSTRAINT "payroll_reconciliation_receipt_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_reconciliation_receipt" ADD CONSTRAINT "payroll_reconciliation_receipt_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "payroll_reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- "Missed bonus" for manual correction lines: a plain taxable earning (no system
-- field), so a correction line can switch its direction and tax treatment.
INSERT INTO "payroll_adjustment_type"
  ("id", "company_id", "code", "name_en", "name_zh", "kind", "taxable", "pensionable",
   "active", "system_field", "sort_order", "created_by", "updated_by")
SELECT gen_random_uuid()::text, c."id", 'MISSED_BONUS', 'Missed bonus', '漏发奖金',
       'EARNING'::"payroll_adjustment_kind", true, false, true, NULL, 35,
       '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'
FROM "company" c
WHERE c."deleted_at" IS NULL
ON CONFLICT ("company_id", "code") DO NOTHING;
