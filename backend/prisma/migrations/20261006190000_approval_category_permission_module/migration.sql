-- Nest RBAC module for New Request create checks (e.g. leave, vehicle-refueling).

ALTER TABLE "approval_category"
ADD COLUMN IF NOT EXISTS "permission_module" TEXT;
