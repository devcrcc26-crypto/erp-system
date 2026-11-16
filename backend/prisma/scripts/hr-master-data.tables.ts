/**
 * Shared table list for the HR master-data migration scripts:
 *   export-hr-master-data.ts  (local DB  -> prisma/data/export/*.json)
 *   import-hr-master-data.ts  (JSON      -> production DB)
 *   verify-migration.ts       (row counts local vs production)
 *
 * Order matters: it is the FK-safe import order. Fields listed in `deferred`
 * point "forward" (to users or to rows of the same table) and are written in a
 * second pass after every table has been imported.
 *
 * Only configuration / master data lives here. Transactional data (payroll runs,
 * attendance, overtime, leave requests, approval requests, sessions, …) is never
 * exported.
 */

export type UserRefMode = 'required' | 'nullable';

export interface TableSpec {
  /** Prisma client delegate name (camelCase model name). */
  model: string;
  /** Human-readable name used in logs and the verification table. */
  label: string;
  /** Output file name under prisma/data/export/. */
  file: string;
  /** Prisma `where` used on export AND when counting rows for verification. */
  where?: Record<string, unknown>;
  /** Columns never read from the source DB (secrets, file refs, auth state). */
  omit?: string[];
  /** Columns that must not be written on import (DB-generated). */
  readOnly?: string[];
  /**
   * Columns that reference User. On import, a value pointing at a user that was
   * not migrated (e.g. a soft-deleted user) is replaced by the fallback user
   * (`required`) or set to null (`nullable`).
   */
  userRefs?: Record<string, UserRefMode>;
  /** Columns written in the second pass (forward / self references). */
  deferred?: string[];
  /**
   * Natural unique key used for upsert instead of `id` (only where production may
   * already hold rows with different ids, e.g. permissions seeded by migrations).
   */
  naturalKey?: string[];
}

/** Rows that belong to a migrated (non soft-deleted) user. */
const OWNED_BY_ACTIVE_EMPLOYEE = { employee: { deletedAt: null } };

export const USER_OMIT = [
  'passwordHash',
  'oneTimePassword',
  'mustChangePassword',
  'mfaEnabled',
  'failedLoginAttempts',
  'lockedUntil',
  'lastLogin',
  'emailVerifiedAt',
  'pendingEmail',
  // Documents / folders are not migrated, so these refs would dangle.
  'profileFolderId',
  'photoDocumentId',
];

/** CompanySetting keys that look like credentials are never exported. */
export const SECRET_SETTING_KEY = /(secret|password|passwd|token|api[_-]?key|private[_-]?key|credential)/i;

export const TABLES: TableSpec[] = [
  { model: 'company', label: 'Company', file: 'company.json' },
  { model: 'branch', label: 'Branch', file: 'branches.json' },
  { model: 'division', label: 'Division', file: 'divisions.json' },
  {
    model: 'department',
    label: 'Department',
    file: 'departments.json',
    userRefs: { leaderUserId: 'nullable' },
    deferred: ['leaderUserId'],
  },
  {
    model: 'discipline',
    label: 'Discipline',
    file: 'disciplines.json',
    userRefs: { leaderId: 'nullable', localLeaderId: 'nullable' },
    deferred: ['leaderId', 'localLeaderId'],
  },
  { model: 'position', label: 'Position', file: 'positions.json' },
  { model: 'seniorityLevel', label: 'SeniorityLevel', file: 'seniority-levels.json' },
  { model: 'costCentre', label: 'CostCentre', file: 'cost-centres.json' },
  { model: 'financialYear', label: 'FinancialYear', file: 'financial-years.json' },
  { model: 'financialPeriod', label: 'FinancialPeriod', file: 'financial-periods.json' },
  { model: 'exchangeRate', label: 'ExchangeRate', file: 'exchange-rates.json' },
  { model: 'workSchedule', label: 'WorkSchedule', file: 'work-schedules.json' },
  { model: 'workScheduleDay', label: 'WorkScheduleDay', file: 'work-schedule-days.json' },
  { model: 'publicHoliday', label: 'PublicHoliday', file: 'public-holidays.json' },
  {
    model: 'role',
    label: 'Role',
    file: 'roles.json',
    deferred: ['parentRoleId'],
  },
  {
    model: 'permission',
    label: 'Permission',
    file: 'permissions.json',
    naturalKey: ['module', 'action'],
  },
  { model: 'rolePermission', label: 'RolePermission', file: 'role-permissions.json' },
  {
    model: 'user',
    label: 'User',
    file: 'users.json',
    where: { deletedAt: null },
    omit: USER_OMIT,
    userRefs: { reportsToUserId: 'nullable' },
    // leavePolicyId: LeavePolicy.createdBy references User, so policies are
    // imported after users and the link is written in the second pass.
    deferred: ['reportsToUserId', 'leavePolicyId'],
  },
  {
    model: 'userRole',
    label: 'UserRole',
    file: 'user-roles.json',
    where: { user: { deletedAt: null } },
  },
  {
    model: 'leavePolicy',
    label: 'LeavePolicy',
    file: 'leave-policies.json',
    userRefs: { createdBy: 'required' },
  },
  { model: 'leavePolicyRule', label: 'LeavePolicyRule', file: 'leave-policy-rules.json' },
  {
    model: 'employeeScheduleAssignment',
    label: 'EmployeeScheduleAssignment',
    file: 'employee-schedule-assignments.json',
    where: OWNED_BY_ACTIVE_EMPLOYEE,
  },
  {
    model: 'employeeContract',
    label: 'EmployeeContract',
    file: 'employee-contracts.json',
    where: OWNED_BY_ACTIVE_EMPLOYEE,
    omit: ['attachmentFolderId'],
    userRefs: { createdBy: 'required' },
  },
  {
    model: 'leaveBalance',
    label: 'LeaveBalance',
    file: 'leave-balances.json',
    where: OWNED_BY_ACTIVE_EMPLOYEE,
    readOnly: ['remaining'],
  },
  {
    model: 'employeePerDiemRate',
    label: 'EmployeePerDiemRate',
    file: 'employee-per-diem-rates.json',
    where: OWNED_BY_ACTIVE_EMPLOYEE,
    userRefs: { createdBy: 'required', updatedBy: 'required' },
  },
  {
    model: 'approvalCategory',
    label: 'ApprovalCategory',
    file: 'approval-categories.json',
    userRefs: { createdBy: 'required', updatedBy: 'required' },
  },
  {
    model: 'companySetting',
    label: 'CompanySetting',
    file: 'company-settings.json',
    // Credential-looking keys are filtered in the export script as well.
    where: {
      NOT: [
        { key: { contains: 'secret', mode: 'insensitive' } },
        { key: { contains: 'password', mode: 'insensitive' } },
        { key: { contains: 'token', mode: 'insensitive' } },
        { key: { contains: 'apikey', mode: 'insensitive' } },
        { key: { contains: 'api_key', mode: 'insensitive' } },
        { key: { contains: 'credential', mode: 'insensitive' } },
      ],
    },
  },
  { model: 'policySetting', label: 'PolicySetting', file: 'policy-settings.json' },
  { model: 'notificationTemplate', label: 'NotificationTemplate', file: 'notification-templates.json' },
  {
    model: 'evaluationTemplate',
    label: 'EvaluationTemplate',
    file: 'evaluation-templates.json',
    userRefs: { createdBy: 'required', updatedBy: 'required' },
  },
  {
    model: 'evaluationSection',
    label: 'EvaluationSection',
    file: 'evaluation-sections.json',
    userRefs: { createdBy: 'required', updatedBy: 'required' },
  },
  {
    model: 'evaluationCriteria',
    label: 'EvaluationCriteria',
    file: 'evaluation-criteria.json',
    userRefs: { createdBy: 'required', updatedBy: 'required' },
  },
];

export const EXPORT_DIR_SEGMENTS = ['prisma', 'data', 'export'];
