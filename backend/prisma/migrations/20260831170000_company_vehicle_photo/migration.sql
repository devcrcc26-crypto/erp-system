-- Add optional vehicle photo linked to document storage.
ALTER TABLE "company_vehicle"
  ADD COLUMN "photo_document_id" TEXT;

CREATE INDEX "idx_company_vehicle_photo_document"
  ON "company_vehicle" ("photo_document_id");

ALTER TABLE "company_vehicle"
  ADD CONSTRAINT "company_vehicle_photo_document_id_fkey"
  FOREIGN KEY ("photo_document_id") REFERENCES "document"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
