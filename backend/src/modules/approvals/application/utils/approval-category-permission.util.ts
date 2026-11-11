/**
 * Maps approval category codes to NestJS RBAC permission modules
 * (the `permission.module` string used by RequireAnyPermission).
 *
 * ApprovalCategory.module is a business label (HR / FINANCE / …) and is not used here.
 */
export const APPROVAL_CATEGORY_PERMISSION_MODULE: Readonly<
  Record<string, string>
> = {
  LEAVE_REQUEST: 'leave',
  SITE_ASSIGNMENT: 'site-assignment',
  WORK_FROM_HOME: 'wfh',
  OVERTIME_APPLICATION: 'overtime',
  FIELD_MOVEMENT_LOG: 'field-movement',
  FLIGHT_APPLICATION: 'flight',
  BUSINESS_TRIP: 'business-trip',
  EXPENSE_CLAIM: 'expense-claim',
  PER_DIEM: 'per-diem',
  PER_DIEM_SETTLEMENT: 'per-diem',
  PURCHASE_REQUEST: 'purchase-request',
  MATERIAL_REQUISITION: 'material-requisition',
  ASSET_REQUEST: 'material-requisition',
  CONSUMABLES_REQUISITION: 'consumables',
  EXIT_PERMIT: 'exit-permit',
  VEHICLE_APPLICATION: 'vehicle-application',
  VEHICLE_REFUELING: 'vehicle-refueling',
  INSPECTION_REPAIR: 'inspection-repair',
  OFFICIAL_SEAL_USAGE: 'official-seal',
  PROJECT_SEAL_USAGE: 'project-seal',
  /** Not user-requestable; mapped for completeness. */
  PAYROLL_RUN: 'payroll',
};

/**
 * Resolves the Nest permission module for a category code.
 * Prefers a stored `permissionModule` when present.
 */
export function resolveCategoryPermissionModule(
  categoryCode: string,
  storedPermissionModule?: string | null,
): string | null {
  const trimmed = storedPermissionModule?.trim();
  if (trimmed) {
    return trimmed;
  }
  return APPROVAL_CATEGORY_PERMISSION_MODULE[categoryCode] ?? null;
}

/** Unique Nest modules used by the New Request picker (excludes payroll). */
export const NEW_REQUEST_PERMISSION_MODULES: readonly string[] = [
  ...new Set(
    Object.entries(APPROVAL_CATEGORY_PERMISSION_MODULE)
      .filter(([code]) => code !== 'PAYROLL_RUN')
      .map(([, module]) => module),
  ),
];
