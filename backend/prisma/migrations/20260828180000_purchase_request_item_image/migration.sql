-- AlterTable
ALTER TABLE "purchase_request_item"
ADD COLUMN "document_id" TEXT;

-- AddForeignKey
ALTER TABLE "purchase_request_item"
ADD CONSTRAINT "purchase_request_item_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "document"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateIndex
CREATE INDEX "idx_purchase_request_item_document" ON "purchase_request_item"("document_id");
