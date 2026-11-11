-- Formalize settlement balance payment (owed to employee or company)
ALTER TABLE "per_diem_request_settlement"
  ADD COLUMN "balance_payment_reference" VARCHAR(100),
  ADD COLUMN "balance_payment_date" DATE,
  ADD COLUMN "balance_paid_at" TIMESTAMP(3),
  ADD COLUMN "balance_paid_by_id" TEXT;

CREATE INDEX "idx_per_diem_request_settlement_balance_paid_by"
  ON "per_diem_request_settlement"("balance_paid_by_id");

ALTER TABLE "per_diem_request_settlement"
  ADD CONSTRAINT "per_diem_request_settlement_balance_paid_by_id_fkey"
  FOREIGN KEY ("balance_paid_by_id") REFERENCES "user"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
