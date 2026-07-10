-- Institute Chief could open the review inbox (review_sessions.approve) but lacked
-- schedule.view / projects.view required by review-mode and discipline endpoints.
-- Mirror Department Chief EPC read access plus design_packages.view.

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
  ic."id",
  p."id",
  CASE WHEN p."action" = 'view' THEN true ELSE false END,
  false,
  CASE WHEN p."action" = 'edit' THEN true ELSE false END,
  false,
  CASE WHEN p."action" = 'approve' THEN true ELSE false END,
  false,
  NOW(),
  NOW(),
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001'
FROM "role" ic
CROSS JOIN "permission" p
WHERE ic."deleted_at" IS NULL
  AND ic."name" = 'Institute Chief'
  AND (
    (p."module" IN ('projects', 'schedule', 'drawings', 'submittals')
      AND p."action" IN ('view', 'edit', 'approve'))
    OR (p."module" = 'design_packages' AND p."action" = 'view')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "role_permission" existing
    WHERE existing."role_id" = ic."id"
      AND existing."permission_id" = p."id"
      AND existing."deleted_at" IS NULL
  );
