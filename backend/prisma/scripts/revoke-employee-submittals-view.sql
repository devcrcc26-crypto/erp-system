-- Soft-delete Employee role → submittals.view so Employee-only users
-- (no Designer / Discipline Lead FK) no longer get pm.submittals.canView.
-- Actor UUID matches the requested admin identity for audit fields.

UPDATE role_permission
SET
  deleted_at = NOW(),
  deleted_by = '4cdeb292-ebad-4c3d-85ff-9c5b0ad49fd0',
  updated_at = NOW(),
  updated_by = '4cdeb292-ebad-4c3d-85ff-9c5b0ad49fd0'
WHERE role_id = (
  SELECT id FROM role
  WHERE name = 'Employee'
    AND deleted_at IS NULL
  LIMIT 1
)
AND permission_id = (
  SELECT id FROM permission
  WHERE module = 'submittals'
    AND action = 'view'
  LIMIT 1
)
AND deleted_at IS NULL;
