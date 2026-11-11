-- Split vendor_contact into vendor_email and vendor_phone
ALTER TABLE "purchase_request" ADD COLUMN "vendor_email" TEXT;
ALTER TABLE "purchase_request" ADD COLUMN "vendor_phone" TEXT;

UPDATE "purchase_request"
SET
  "vendor_email" = CASE
    WHEN "vendor_contact" IS NOT NULL AND "vendor_contact" LIKE '%@%'
    THEN "vendor_contact"
    ELSE NULL
  END,
  "vendor_phone" = CASE
    WHEN "vendor_contact" IS NOT NULL AND "vendor_contact" NOT LIKE '%@%'
    THEN "vendor_contact"
    ELSE NULL
  END
WHERE "vendor_contact" IS NOT NULL;

ALTER TABLE "purchase_request" DROP COLUMN "vendor_contact";
