ALTER TYPE "FolderContextType" ADD VALUE 'EXPENSE_CLAIM';

CREATE TYPE "ExpenseClaimStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'IN_REVIEW',
  'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'
);

CREATE TABLE "expense_claim" (
  "id"                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id"            TEXT NOT NULL REFERENCES "company"("id"),
  "claim_number"          TEXT NOT NULL,
  "employee_id"           TEXT NOT NULL REFERENCES "user"("id"),
  "title"                 TEXT NOT NULL,
  "description"           TEXT,
  "status"                "ExpenseClaimStatus" NOT NULL DEFAULT 'DRAFT',
  "total_amount_etb"      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  "approval_request_id"   TEXT UNIQUE REFERENCES "approval_request"("id"),
  "attachment_folder_id"  TEXT REFERENCES "document_folder"("id"),
  "submitted_at"          TIMESTAMP(3),
  "completed_at"          TIMESTAMP(3),
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"            TEXT NOT NULL REFERENCES "user"("id"),
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"            TEXT NOT NULL REFERENCES "user"("id"),
  "deleted_at"            TIMESTAMP(3),
  "deleted_by"            TEXT,
  UNIQUE ("company_id", "claim_number")
);

CREATE SEQUENCE "expense_claim_number_seq";

CREATE TABLE "expense_claim_item" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "claim_id"        TEXT NOT NULL REFERENCES "expense_claim"("id") ON DELETE CASCADE,
  "category"        TEXT NOT NULL,
  "description"     TEXT NOT NULL,
  "amount"          NUMERIC(14, 2) NOT NULL,
  "currency"        "SupportedCurrency" NOT NULL DEFAULT 'ETB',
  "amount_etb"      NUMERIC(14, 2) NOT NULL,
  "exchange_rate"   NUMERIC(18, 6) NOT NULL DEFAULT 1,
  "expense_date"    DATE NOT NULL,
  "document_id"     TEXT REFERENCES "document"("id"),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_expense_claim_company" ON "expense_claim"("company_id");
CREATE INDEX "idx_expense_claim_employee" ON "expense_claim"("employee_id");
CREATE INDEX "idx_expense_claim_status" ON "expense_claim"("status");
CREATE INDEX "idx_expense_claim_item_claim" ON "expense_claim_item"("claim_id");
