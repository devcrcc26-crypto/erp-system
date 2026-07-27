-- Phase 1: site representative FK on design package (subtask).
ALTER TABLE design_package
  ADD COLUMN IF NOT EXISTS site_representative_user_id TEXT REFERENCES "user"(id);

CREATE INDEX IF NOT EXISTS idx_design_package_site_representative_user_id
  ON design_package (site_representative_user_id);
