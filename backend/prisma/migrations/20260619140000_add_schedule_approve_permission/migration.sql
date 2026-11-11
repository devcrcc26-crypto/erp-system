-- Add schedule.approve permission for design package workflow actions.
INSERT INTO "permission" ("id", "module", "action", "description")
SELECT gen_random_uuid(), 'schedule', 'approve', 'Approve design packages and EDVs'
WHERE NOT EXISTS (
  SELECT 1
  FROM "permission"
  WHERE "module" = 'schedule' AND "action" = 'approve'
);

-- Grant approve to roles that can edit the schedule (PM, leads, etc.).
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
  rp."role_id",
  p_approve."id",
  false,
  false,
  false,
  false,
  true,
  false,
  NOW(),
  NOW(),
  rp."created_by",
  rp."updated_by"
FROM "role_permission" rp
INNER JOIN "permission" p_edit
  ON p_edit."id" = rp."permission_id"
  AND p_edit."module" = 'schedule'
  AND p_edit."action" = 'edit'
INNER JOIN "permission" p_approve
  ON p_approve."module" = 'schedule'
  AND p_approve."action" = 'approve'
WHERE rp."deleted_at" IS NULL
  AND (rp."can_edit" = true OR rp."can_create" = true OR rp."can_approve" = true)
  AND NOT EXISTS (
    SELECT 1
    FROM "role_permission" existing
    WHERE existing."role_id" = rp."role_id"
      AND existing."permission_id" = p_approve."id"
      AND existing."deleted_at" IS NULL
  );
