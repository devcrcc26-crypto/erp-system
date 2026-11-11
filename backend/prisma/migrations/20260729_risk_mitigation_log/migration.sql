-- Risk mitigation attempt log (multiple assessments per risk)
CREATE TABLE IF NOT EXISTS risk_mitigation (
  id TEXT PRIMARY KEY,
  risk_id TEXT NOT NULL REFERENCES risk(id),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  mitigation_strategy TEXT NOT NULL,
  residual_likelihood INTEGER NOT NULL,
  residual_impact INTEGER NOT NULL,
  residual_score INTEGER NOT NULL,
  notes TEXT,
  assessed_by TEXT NOT NULL REFERENCES "user"(id),
  assessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_mitigation_risk_id
  ON risk_mitigation(risk_id);

CREATE INDEX IF NOT EXISTS idx_risk_mitigation_risk_score
  ON risk_mitigation(risk_id, residual_score);

-- Backfill attempt 1 from existing residual / mitigation_plan data
INSERT INTO risk_mitigation (
  id,
  risk_id,
  attempt_number,
  mitigation_strategy,
  residual_likelihood,
  residual_impact,
  residual_score,
  assessed_by,
  assessed_at,
  created_at
)
SELECT
  gen_random_uuid()::text,
  r.id,
  1,
  COALESCE(NULLIF(TRIM(r.mitigation_plan), ''), 'Existing mitigation assessment'),
  r.residual_likelihood,
  r.residual_impact,
  COALESCE(r.residual_score, r.residual_likelihood * r.residual_impact),
  r.created_by,
  r.updated_at,
  r.updated_at
FROM risk r
WHERE r.residual_likelihood IS NOT NULL
  AND r.residual_impact IS NOT NULL
  AND r.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM risk_mitigation rm WHERE rm.risk_id = r.id
  );
