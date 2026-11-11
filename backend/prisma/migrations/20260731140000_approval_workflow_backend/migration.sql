-- Approval workflow engine: extend request/tier for full backend

ALTER TYPE "ApprovalRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "ApprovalTierDecision" ADD VALUE IF NOT EXISTS 'CONDITIONALLY_APPROVED';
ALTER TYPE "ApprovalTierDecision" ADD VALUE IF NOT EXISTS 'RETURNED';

ALTER TABLE approval_request
  ADD COLUMN IF NOT EXISTS title TEXT;

UPDATE approval_request
SET title = COALESCE(title, request_number)
WHERE title IS NULL;

ALTER TABLE approval_request
  ALTER COLUMN title SET NOT NULL;

ALTER TABLE approval_tier
  ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE SEQUENCE IF NOT EXISTS approval_request_number_seq START WITH 1 INCREMENT BY 1;

-- Approvals module permissions
INSERT INTO permission (id, module, action, description)
SELECT gen_random_uuid()::text, v.module, v.action, v.description
FROM (
  VALUES
    ('approvals', 'view', 'View approval categories and requests'),
    ('approvals', 'create', 'Submit approval requests'),
    ('approvals', 'approve', 'Approve, reject, return, or condition approval tiers'),
    ('approvals', 'edit', 'Edit approval categories')
) AS v(module, action, description)
WHERE NOT EXISTS (
  SELECT 1 FROM permission p
  WHERE p.module = v.module AND p.action = v.action
);

-- Grant all approvals permissions to System Administrator roles
INSERT INTO role_permission (
  id, role_id, permission_id,
  can_view, can_create, can_edit, can_delete, can_approve, can_export,
  created_at, updated_at, created_by, updated_by
)
SELECT
  gen_random_uuid()::text,
  r.id,
  p.id,
  true, true, true, true, true, true,
  NOW(), NOW(),
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001'
FROM role r
CROSS JOIN permission p
WHERE r.deleted_at IS NULL
  AND r.name = 'System Administrator'
  AND p.module = 'approvals'
  AND NOT EXISTS (
    SELECT 1 FROM role_permission existing
    WHERE existing.role_id = r.id
      AND existing.permission_id = p.id
      AND existing.deleted_at IS NULL
  );

-- Employees can view and submit
INSERT INTO role_permission (
  id, role_id, permission_id,
  can_view, can_create, can_edit, can_delete, can_approve, can_export,
  created_at, updated_at, created_by, updated_by
)
SELECT
  gen_random_uuid()::text,
  r.id,
  p.id,
  CASE WHEN p.action = 'view' THEN true ELSE false END,
  CASE WHEN p.action = 'create' THEN true ELSE false END,
  false, false, false, false,
  NOW(), NOW(),
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001'
FROM role r
CROSS JOIN permission p
WHERE r.deleted_at IS NULL
  AND r.name = 'Employee'
  AND p.module = 'approvals'
  AND p.action IN ('view', 'create')
  AND NOT EXISTS (
    SELECT 1 FROM role_permission existing
    WHERE existing.role_id = r.id
      AND existing.permission_id = p.id
      AND existing.deleted_at IS NULL
  );
