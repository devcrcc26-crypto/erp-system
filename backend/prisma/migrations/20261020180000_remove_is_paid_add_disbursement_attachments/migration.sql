-- Drop paid markers from per_diem_request (payment tracked via disbursements)
ALTER TABLE "per_diem_request" DROP CONSTRAINT IF EXISTS "per_diem_request_paid_by_fkey";
DROP INDEX IF EXISTS "idx_per_diem_paid_at";
ALTER TABLE "per_diem_request" DROP COLUMN IF EXISTS "paid_at";
ALTER TABLE "per_diem_request" DROP COLUMN IF EXISTS "paid_by";
ALTER TABLE "per_diem_request" DROP COLUMN IF EXISTS "paid_amount";
ALTER TABLE "per_diem_request" DROP COLUMN IF EXISTS "payment_reference";

-- Disbursement receipt attachments
CREATE TABLE "per_diem_disbursement_attachment" (
    "id" TEXT NOT NULL,
    "disbursement_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "per_diem_disbursement_attachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_per_diem_disbursement_attachment_disbursement" ON "per_diem_disbursement_attachment"("disbursement_id");

ALTER TABLE "per_diem_disbursement_attachment" ADD CONSTRAINT "per_diem_disbursement_attachment_disbursement_id_fkey" FOREIGN KEY ("disbursement_id") REFERENCES "per_diem_disbursement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "per_diem_disbursement_attachment" ADD CONSTRAINT "per_diem_disbursement_attachment_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
