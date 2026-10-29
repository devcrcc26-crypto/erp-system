-- Expense claim items: one item can have several receipt files.
-- Replaces the single expense_claim_item.document_id with a child table.

CREATE TABLE "expense_claim_item_receipt" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "item_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_claim_item_receipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_expense_claim_item_receipt" ON "expense_claim_item_receipt"("item_id", "document_id");
CREATE INDEX "idx_expense_claim_item_receipt_item" ON "expense_claim_item_receipt"("item_id");

ALTER TABLE "expense_claim_item_receipt"
    ADD CONSTRAINT "expense_claim_item_receipt_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "expense_claim_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "expense_claim_item_receipt"
    ADD CONSTRAINT "expense_claim_item_receipt_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Keep every existing receipt: copy it onto the new table.
INSERT INTO "expense_claim_item_receipt" ("item_id", "document_id", "created_at")
SELECT "id", "document_id", "created_at"
FROM "expense_claim_item"
WHERE "document_id" IS NOT NULL;

-- The single-receipt column (and its inline foreign key) is no longer used.
ALTER TABLE "expense_claim_item" DROP COLUMN "document_id";
