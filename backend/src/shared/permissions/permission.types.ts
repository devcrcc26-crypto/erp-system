export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'export'
  | 'manage';

export interface PermissionFlags {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
}

export const EMPTY_PERMISSION_FLAGS: PermissionFlags = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
  canExport: false,
};

export const ACTION_TO_FLAG: Record<PermissionAction, keyof PermissionFlags> = {
  view: 'canView',
  create: 'canCreate',
  edit: 'canEdit',
  delete: 'canDelete',
  approve: 'canApprove',
  export: 'canExport',
  manage: 'canEdit',
};

/**
 * Read-only access to every payroll run (Managing Director). Separate from
 * `payroll.view`, which every employee holds for their own payslips.
 */
export const PAYROLL_OVERSIGHT_MODULE = 'payroll-oversight';
