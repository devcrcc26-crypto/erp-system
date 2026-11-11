ALTER TABLE "expense_claim"
  ADD COLUMN "paid_at" TIMESTAMP(3),
  ADD COLUMN "paid_by_id" TEXT,
  ADD COLUMN "payment_reference" VARCHAR(100);

CREATE INDEX "idx_expense_claim_paid_by" ON "expense_claim"("paid_by_id");

ALTER TABLE "expense_claim"
  ADD CONSTRAINT "expense_claim_paid_by_id_fkey"
  FOREIGN KEY ("paid_by_id") REFERENCES "user"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
