-- Residual risk fields, stored as small ints (1-5) matching probability/impact.
ALTER TABLE risk
  ADD COLUMN IF NOT EXISTS residual_likelihood INTEGER,
  ADD COLUMN IF NOT EXISTS residual_impact INTEGER,
  ADD COLUMN IF NOT EXISTS residual_score INTEGER;

-- Risk review log: one row per tracked-field change on a risk.
CREATE TABLE IF NOT EXISTS risk_review (
  id TEXT PRIMARY KEY,
  risk_id TEXT NOT NULL REFERENCES risk(id),
  reviewed_by TEXT NOT NULL REFERENCES "user"(id),
  reviewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  previous_status TEXT,
  new_status TEXT,
  previous_score INTEGER,
  new_score INTEGER,
  previous_residual_score INTEGER,
  new_residual_score INTEGER,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_review_risk_id ON risk_review(risk_id);

-- Additive enum extensions - existing rows/values (e.g. COST, MONITORING) untouched.
ALTER TYPE "RiskCategory" ADD VALUE IF NOT EXISTS 'TECHNICAL';
ALTER TYPE "RiskCategory" ADD VALUE IF NOT EXISTS 'FINANCIAL';
ALTER TYPE "RiskCategory" ADD VALUE IF NOT EXISTS 'LEGAL';
ALTER TYPE "RiskCategory" ADD VALUE IF NOT EXISTS 'POLITICAL';
ALTER TYPE "RiskCategory" ADD VALUE IF NOT EXISTS 'OTHER';
ALTER TYPE "RiskStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
