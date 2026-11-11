-- Grant schedule.approve to EPC review governance roles (Reviewer has approve-only, not edit).
INSERT INTO "role_permission" (
  "id",
  "role_id",
  "permission_id",
  "can_view",
  "can_create",
  "can_edit",
  "can_delete",
  "can_approve",
  "can_export",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by"
)
SELECT
  gen_random_uuid(),
  r."id",
  p_approve."id",
  false,
  false,
  false,
  false,
  true,
  false,
  NOW(),
  NOW(),
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001'
FROM "role" r
INNER JOIN "permission" p_approve
  ON p_approve."module" = 'schedule'
  AND p_approve."action" = 'approve'
WHERE r."deleted_at" IS NULL
  AND r."name" IN (
    'Reviewer',
    'Discipline Lead',
    'Department Chief',
    'Institute Chief',
    'Deputy Chief',
    'Project Manager',
    'Managing Director',
    'Project Director',
    'General Manager'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "role_permission" existing
    WHERE existing."role_id" = r."id"
      AND existing."permission_id" = p_approve."id"
      AND existing."deleted_at" IS NULL
  );
