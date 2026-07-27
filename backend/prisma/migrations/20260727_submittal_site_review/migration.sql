-- Phase 3: External Release site review workflow

ALTER TYPE "SubmittalStatus" ADD VALUE IF NOT EXISTS 'UNDER_SITE_REVIEW';
ALTER TYPE "SubmittalStatus" ADD VALUE IF NOT EXISTS 'SITE_APPROVED';

DO $$ BEGIN
  CREATE TYPE "SubmittalSiteReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'COMMENTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE submittal
  ADD COLUMN IF NOT EXISTS site_review_required BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS submittal_site_review (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES "company"(id),
  submittal_id TEXT NOT NULL REFERENCES submittal(id),
  site_rep_user_id TEXT NOT NULL REFERENCES "user"(id),
  status "SubmittalSiteReviewStatus" NOT NULL DEFAULT 'PENDING',
  comment TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_submittal_site_review_submittal_rep
  ON submittal_site_review (submittal_id, site_rep_user_id);

CREATE INDEX IF NOT EXISTS idx_submittal_site_review_company_id
  ON submittal_site_review (company_id);

CREATE INDEX IF NOT EXISTS idx_submittal_site_review_submittal_id
  ON submittal_site_review (submittal_id);

CREATE INDEX IF NOT EXISTS idx_submittal_site_review_site_rep_user_id
  ON submittal_site_review (site_rep_user_id);
