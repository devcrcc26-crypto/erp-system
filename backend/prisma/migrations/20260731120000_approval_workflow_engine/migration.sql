-- Approval workflow engine: categories, requests, tiers, comments

CREATE TYPE "ApprovalRequestStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'RETURNED'
);

CREATE TYPE "ApprovalTierDecision" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SKIPPED'
);

CREATE TABLE approval_category (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL
    REFERENCES company(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  module TEXT NOT NULL
    DEFAULT 'GENERAL',
  form_schema JSONB NOT NULL
    DEFAULT '[]',
  approval_rules JSONB NOT NULL
    DEFAULT '[]',
  number_prefix TEXT NOT NULL,
  is_active BOOLEAN NOT NULL
    DEFAULT true,
  allow_attachments BOOLEAN
    NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL
    DEFAULT 0,
  created_at TIMESTAMP NOT NULL
    DEFAULT NOW(),
  created_by TEXT NOT NULL
    REFERENCES "user"(id),
  updated_at TIMESTAMP NOT NULL
    DEFAULT NOW(),
  updated_by TEXT NOT NULL
    REFERENCES "user"(id),
  deleted_at TIMESTAMP,
  deleted_by TEXT,
  UNIQUE (company_id, code)
);

CREATE TABLE approval_request (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL
    REFERENCES company(id),
  category_id TEXT NOT NULL
    REFERENCES approval_category(id),
  request_number TEXT NOT NULL,
  form_data JSONB NOT NULL
    DEFAULT '{}',
  requested_by TEXT NOT NULL
    REFERENCES "user"(id),
  status "ApprovalRequestStatus"
    NOT NULL DEFAULT 'DRAFT',
  current_tier INTEGER
    NOT NULL DEFAULT 0,
  matched_rule_name TEXT,
  submitted_at TIMESTAMP,
  completed_at TIMESTAMP,
  attachment_folder_id TEXT
    REFERENCES document_folder(id),
  notes TEXT,
  created_at TIMESTAMP NOT NULL
    DEFAULT NOW(),
  created_by TEXT NOT NULL
    REFERENCES "user"(id),
  updated_at TIMESTAMP NOT NULL
    DEFAULT NOW(),
  updated_by TEXT NOT NULL
    REFERENCES "user"(id),
  deleted_at TIMESTAMP,
  deleted_by TEXT
);

CREATE TABLE approval_tier (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL
    REFERENCES approval_request(id),
  tier_order INTEGER NOT NULL,
  label TEXT NOT NULL,
  approver_id TEXT NOT NULL
    REFERENCES "user"(id),
  resolver TEXT NOT NULL,
  decision "ApprovalTierDecision"
    NOT NULL DEFAULT 'PENDING',
  comment TEXT,
  decided_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL
    DEFAULT NOW()
);

CREATE TABLE approval_comment (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL
    REFERENCES approval_request(id),
  comment_by TEXT NOT NULL
    REFERENCES "user"(id),
  comment_text TEXT NOT NULL,
  attachment_id TEXT
    REFERENCES document(id),
  created_at TIMESTAMP NOT NULL
    DEFAULT NOW()
);

CREATE INDEX idx_approval_request_company
  ON approval_request(company_id);
CREATE INDEX idx_approval_request_category
  ON approval_request(category_id);
CREATE INDEX idx_approval_request_status
  ON approval_request(status);
CREATE INDEX idx_approval_request_requested_by
  ON approval_request(requested_by);
CREATE INDEX idx_approval_tier_request
  ON approval_tier(request_id);
CREATE INDEX idx_approval_tier_approver
  ON approval_tier(approver_id);
