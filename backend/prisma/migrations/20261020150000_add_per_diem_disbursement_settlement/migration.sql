ALTER TABLE "per_diem_request" ADD COLUMN IF NOT EXISTS "actual_start_date" DATE;

CREATE TABLE IF NOT EXISTS "per_diem_disbursement" (
  "id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "disbursed_at" TIMESTAMPTZ NOT NULL,
  "covered_days_from" DATE NOT NULL,
  "covered_days_to" DATE NOT NULL,
  "disbursed_by_id" TEXT NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "per_diem_disbursement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_per_diem_disbursement_request" ON "per_diem_disbursement"("request_id");

ALTER TABLE "per_diem_disbursement" ADD CONSTRAINT "per_diem_disbursement_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "per_diem_request"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "per_diem_disbursement" ADD CONSTRAINT "per_diem_disbursement_disbursed_by_id_fkey"
  FOREIGN KEY ("disbursed_by_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE IF NOT EXISTS "per_diem_request_settlement" (
  "id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "actual_return_date" DATE NOT NULL,
  "actual_days" INTEGER NOT NULL,
  "earned_total" DECIMAL(15,2) NOT NULL,
  "total_disbursed" DECIMAL(15,2) NOT NULL,
  "balance" DECIMAL(15,2) NOT NULL,
  "settled_by_id" TEXT NOT NULL,
  "settled_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "notes" TEXT,
  CONSTRAINT "per_diem_request_settlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "per_diem_request_settlement_request_id_key" UNIQUE ("request_id")
);

ALTER TABLE "per_diem_request_settlement" ADD CONSTRAINT "per_diem_request_settlement_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "per_diem_request"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "per_diem_request_settlement" ADD CONSTRAINT "per_diem_request_settlement_settled_by_id_fkey"
  FOREIGN KEY ("settled_by_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
