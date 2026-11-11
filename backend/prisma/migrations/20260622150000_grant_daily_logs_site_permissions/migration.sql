-- Grant Site Coordinator daily log access (view, create, edit).
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
  p."id",
  p."action" = 'view',
  p."action" = 'create',
  p."action" = 'edit',
  false,
  false,
  false,
  NOW(),
  NOW(),
  r."created_by",
  r."updated_by"
FROM "role" r
CROSS JOIN "permission" p
WHERE r."deleted_at" IS NULL
  AND r."name" = 'Site Coordinator'
  AND p."module" = 'daily_logs'
  AND p."action" IN ('view', 'create', 'edit')
  AND NOT EXISTS (
    SELECT 1
    FROM "role_permission" existing
    WHERE existing."role_id" = r."id"
      AND existing."permission_id" = p."id"
      AND existing."deleted_at" IS NULL
  );
