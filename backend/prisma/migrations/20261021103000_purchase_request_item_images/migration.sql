-- Multiple images per purchase request line item
CREATE TABLE "purchase_request_item_image" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_request_item_image_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_purchase_request_item_image_item_doc" ON "purchase_request_item_image"("item_id", "document_id");
CREATE INDEX "idx_purchase_request_item_image_item" ON "purchase_request_item_image"("item_id");
CREATE INDEX "idx_purchase_request_item_image_document" ON "purchase_request_item_image"("document_id");

ALTER TABLE "purchase_request_item_image" ADD CONSTRAINT "purchase_request_item_image_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_request_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "purchase_request_item_image" ADD CONSTRAINT "purchase_request_item_image_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

INSERT INTO "purchase_request_item_image" ("id", "item_id", "document_id", "sort_order")
SELECT gen_random_uuid()::text, "id", "document_id", 0
FROM "purchase_request_item"
WHERE "document_id" IS NOT NULL;
