-- Approval response (resubmit + condition response) with document links

ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'APPROVAL';

CREATE TABLE "approval_response" (
  "id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "response_type" TEXT NOT NULL,
  "condition_index" INTEGER,
  "note" TEXT,
  "responded_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "approval_response_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_response_document" (
  "id" TEXT NOT NULL,
  "response_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "approval_response_document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_approval_response_request" ON "approval_response"("request_id");
CREATE INDEX "idx_approval_response_document_response" ON "approval_response_document"("response_id");
CREATE INDEX "idx_approval_response_document_document" ON "approval_response_document"("document_id");

ALTER TABLE "approval_response"
  ADD CONSTRAINT "approval_response_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "approval_request"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_response"
  ADD CONSTRAINT "approval_response_responded_by_fkey"
  FOREIGN KEY ("responded_by") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_response_document"
  ADD CONSTRAINT "approval_response_document_response_id_fkey"
  FOREIGN KEY ("response_id") REFERENCES "approval_response"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_response_document"
  ADD CONSTRAINT "approval_response_document_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "document"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
