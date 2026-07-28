-- ER external approval workflow: statuses + approval/feedback tables
-- Postgres cannot alter an enum column type while a typed DEFAULT remains.

ALTER TABLE submittal
  ALTER COLUMN status DROP DEFAULT;

ALTER TYPE "SubmittalStatus" RENAME TO "SubmittalStatus_old";

CREATE TYPE "SubmittalStatus" AS ENUM (
  'DRAFT',
  'UNDER_SITE_REVIEW',
  'SITE_APPROVED',
  'PENDING_CONSULTANT_REVIEW',
  'CONSULTANT_REVIEWED',
  'SUBMITTED',
  'WITHDRAWN',
  'UNDER_REVIEW',
  'APPROVED',
  'APPROVED_WITH_COMMENTS',
  'REVISE_AND_RESUBMIT',
  'REJECTED'
);

ALTER TABLE submittal
  ALTER COLUMN status TYPE "SubmittalStatus"
  USING status::text::"SubmittalStatus";

ALTER TABLE submittal_review
  ALTER COLUMN status TYPE "SubmittalStatus"
  USING status::text::"SubmittalStatus";

DROP TYPE "SubmittalStatus_old";

ALTER TABLE submittal
  ALTER COLUMN status SET DEFAULT 'DRAFT'::"SubmittalStatus";

CREATE TABLE IF NOT EXISTS submittal_external_approval (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES "company"(id),
  submittal_id TEXT NOT NULL REFERENCES submittal(id),
  approval_type TEXT NOT NULL,
  approved_by_name TEXT NOT NULL,
  on_behalf_of TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  evidence_folder_id TEXT REFERENCES document_folder(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL REFERENCES "user"(id)
);

CREATE INDEX IF NOT EXISTS idx_submittal_external_approval_company_id
  ON submittal_external_approval (company_id);
CREATE INDEX IF NOT EXISTS idx_submittal_external_approval_submittal_id
  ON submittal_external_approval (submittal_id);

CREATE TABLE IF NOT EXISTS submittal_external_feedback (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES "company"(id),
  submittal_id TEXT NOT NULL REFERENCES submittal(id),
  feedback_from TEXT NOT NULL,
  feedback_kind TEXT NOT NULL,
  comment TEXT NOT NULL,
  evidence_folder_id TEXT REFERENCES document_folder(id),
  linked_cr_id TEXT REFERENCES project_change_request(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL REFERENCES "user"(id)
);

CREATE INDEX IF NOT EXISTS idx_submittal_external_feedback_company_id
  ON submittal_external_feedback (company_id);
CREATE INDEX IF NOT EXISTS idx_submittal_external_feedback_submittal_id
  ON submittal_external_feedback (submittal_id);
