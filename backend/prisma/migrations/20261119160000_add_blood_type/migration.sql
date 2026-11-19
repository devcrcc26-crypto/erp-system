-- Employee ID card: blood type + issuance control fields.

ALTER TABLE "user"
ADD COLUMN "blood_type" TEXT,
ADD COLUMN "id_card_issued" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "id_card_issued_at" TIMESTAMP(3),
ADD COLUMN "id_card_issued_by" TEXT;
