-- External parties on design_package (site rep type + contact, client consultant)

DO $$ BEGIN
  CREATE TYPE "SiteRepType" AS ENUM ('INTERNAL', 'EXTERNAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE design_package
  ADD COLUMN IF NOT EXISTS site_rep_type "SiteRepType" DEFAULT 'EXTERNAL',
  ADD COLUMN IF NOT EXISTS site_rep_name TEXT,
  ADD COLUMN IF NOT EXISTS site_rep_email TEXT,
  ADD COLUMN IF NOT EXISTS site_rep_phone TEXT,
  ADD COLUMN IF NOT EXISTS site_rep_company TEXT,
  ADD COLUMN IF NOT EXISTS consultant_name TEXT,
  ADD COLUMN IF NOT EXISTS consultant_title TEXT,
  ADD COLUMN IF NOT EXISTS consultant_email TEXT,
  ADD COLUMN IF NOT EXISTS consultant_phone TEXT,
  ADD COLUMN IF NOT EXISTS consultant_company TEXT;

-- Existing rows with an internal site-rep FK should be marked INTERNAL
UPDATE design_package
SET site_rep_type = 'INTERNAL'
WHERE site_representative_user_id IS NOT NULL
  AND (site_rep_type IS NULL OR site_rep_type = 'EXTERNAL');
