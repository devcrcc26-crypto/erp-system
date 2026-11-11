-- Phase 3a: overseas task number (manual entry)
ALTER TABLE task ADD COLUMN IF NOT EXISTS overseas_task_number TEXT;

-- Phase 3b: commission mode on task (copied from project contract_type)
CREATE TYPE "CommissionMode" AS ENUM (
  'CONTRACT',
  'EMAIL',
  'INFORMAL_ASSIGNMENT',
  'NO_ASSIGNMENT'
);

ALTER TABLE task ADD COLUMN IF NOT EXISTS commission_mode "CommissionMode";

UPDATE task AS t
SET commission_mode = p.contract_type::text::"CommissionMode"
FROM project AS p
WHERE t.project_id = p.id
  AND t.deleted_at IS NULL
  AND t.commission_mode IS NULL;

-- Phase 3d: remove CRITICAL from urgency (0 live rows)
CREATE TYPE "UrgencyLevel_new" AS ENUM ('NORMAL', 'URGENT', 'VERY_URGENT');

ALTER TABLE task ALTER COLUMN urgency_level DROP DEFAULT;
ALTER TABLE task
  ALTER COLUMN urgency_level TYPE "UrgencyLevel_new"
  USING urgency_level::text::"UrgencyLevel_new";

DROP TYPE "UrgencyLevel";
ALTER TYPE "UrgencyLevel_new" RENAME TO "UrgencyLevel";
ALTER TABLE task ALTER COLUMN urgency_level SET DEFAULT 'NORMAL'::"UrgencyLevel";

-- Phase 3e: approval level rename + data migration
CREATE TYPE "ApprovalLevel_new" AS ENUM (
  'DESIGN_INSTITUTE_REVIEW',
  'COMPANY_REVIEW'
);

ALTER TABLE task
  ALTER COLUMN approval_level TYPE "ApprovalLevel_new"
  USING (
    CASE approval_level::text
      WHEN 'INSTITUTE' THEN 'DESIGN_INSTITUTE_REVIEW'::"ApprovalLevel_new"
      WHEN 'DEPARTMENT' THEN 'COMPANY_REVIEW'::"ApprovalLevel_new"
      ELSE NULL
    END
  );

DROP TYPE "ApprovalLevel";
ALTER TYPE "ApprovalLevel_new" RENAME TO "ApprovalLevel";

-- Phase 3i: soft-delete demo task TAS-00002 ("A")
UPDATE task
SET deleted_at = NOW()
WHERE task_id_code = 'TAS-00002'
  AND deleted_at IS NULL;
