-- Grant reports module access for portfolio summary and system reports page.
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
  p."action" = 'export',
  NOW(),
  NOW(),
  r."created_by",
  r."updated_by"
FROM "role" r
CROSS JOIN "permission" p
WHERE r."deleted_at" IS NULL
  AND r."name" IN (
    'Managing Director',
    'Project Manager',
    'General Manager',
    'Project Director'
  )
  AND p."module" = 'reports'
  AND p."action" IN ('view', 'create', 'edit', 'export')
  AND NOT EXISTS (
    SELECT 1
    FROM "role_permission" existing
    WHERE existing."role_id" = r."id"
      AND existing."permission_id" = p."id"
      AND existing."deleted_at" IS NULL
  );

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
  false,
  false,
  false,
  false,
  p."action" = 'export',
  NOW(),
  NOW(),
  r."created_by",
  r."updated_by"
FROM "role" r
CROSS JOIN "permission" p
WHERE r."deleted_at" IS NULL
  AND r."name" IN ('Finance Manager', 'Accountant')
  AND p."module" = 'reports'
  AND p."action" IN ('view', 'export')
  AND NOT EXISTS (
    SELECT 1
    FROM "role_permission" existing
    WHERE existing."role_id" = r."id"
      AND existing."permission_id" = p."id"
      AND existing."deleted_at" IS NULL
  );
