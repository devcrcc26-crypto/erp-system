import type { DocsRoleKey } from '../roles.js';
import { HELP_MODULE_SLUGS } from './help-slugs.js';

/**
 * Default values for App Router dynamic segments.
 * Role overrides replace these keys (e.g. employeeId for scoped views).
 *
 * Values come from the local staging seed — update when seed IDs change.
 * Missing keys → route skipped and listed in coverage as "skipped".
 */
export type DynamicValueMap = Record<string, string>;

/** Seeded EPC demo UUIDs (frontend/e2e/fixtures/epc-demo.ts) — unused while PM is excluded. */
const EPC_DEMO = {
  projectId: '00000000-0000-4000-8000-00000003e9',
  taskDisciplineId: '00000000-0000-4000-8000-00000004b0',
  packageId: '00000000-0000-4000-8000-00000004ba',
} as const;

/** Eyuel Tilahun — plain Employee account. */
export const EMPLOYEE_USER_ID = '7ea3b336-6812-4d1d-a250-fb5a94154db0';

/**
 * Shared defaults for non-scoped capture.
 * Prefer entity UUIDs that exist in staging seed data.
 */
export const DEFAULT_DYNAMIC_VALUES: DynamicValueMap = {
  id: '440c6539-d4b4-4447-a275-5a9bd18d5342', // leave request (fallback for many [id] pages)
  employeeId: EMPLOYEE_USER_ID,
  projectId: EPC_DEMO.projectId,
  packageId: EPC_DEMO.packageId,
  taskDisciplineId: EPC_DEMO.taskDisciplineId,
  month: '10',
  year: '2026',
  // Entity-specific overrides used by path-aware resolver
  'leave-request-id': '440c6539-d4b4-4447-a275-5a9bd18d5342',
  'overtime-id': '3795e1dc-ee51-48ca-8ef1-8fbb274de7c6',
  'expense-id': 'a7143c2c-5996-46ab-aa16-e8ecbc36f0cd',
  'per-diem-id': '6edd3a4c-b2c3-4557-b31e-3d44834b0818',
  'approval-id': '3855671f-6633-48e1-af84-a747489b377c',
  'contract-id': '1e784ef1-ef2c-4c77-b814-d10cce426303',
  'leave-policy-id': '7a7c33c6-a5a5-4528-b52d-8abcf075046e',
  'work-schedule-id': '4267a2d7-d032-4497-862f-2b11c76896c5',
  'holiday-id': '47b04428-085b-4551-a837-e92831510cdf',
  'payroll-id': '74ba3fb4-5e5f-49dc-b176-7059767bc447',
  'site-assignment-id': '9da06d6b-d3c0-4c24-bb46-b4a0856c15a1',
  'flight-id': '62276e34-b641-43b3-8476-a9bdc738c7ca',
  'business-trip-id': '3c5bdf29-8566-4456-82f9-496e98361ba0',
  'audit-log-id': '0ea52196-738d-47f1-8e7e-ae400aeaa7a7',
  'user-id': EMPLOYEE_USER_ID,
};

/**
 * Per-role overrides. Department Head / Discipline Lead should point
 * employeeId (and related entity ids) at people inside their scope.
 */
export const ROLE_DYNAMIC_OVERRIDES: Partial<
  Record<DocsRoleKey, DynamicValueMap>
> = {
  EMPLOYEE: {
    employeeId: EMPLOYEE_USER_ID,
    'user-id': EMPLOYEE_USER_ID,
  },
  DEPARTMENT_HEAD: {
    // Temporary placeholder Ben Wu leads Architectural Design (35 staff).
    employeeId: 'c88fea2a-fc2d-4104-94c6-4a02a9e7fbc5', // Abenezer Abadi in scope
    'user-id': 'c88fea2a-fc2d-4104-94c6-4a02a9e7fbc5',
  },
  DISCIPLINE_LEADER: {
    // Fill after seed sets Architecture discipline leader + members.
    // employeeId: '<uuid-in-architecture-discipline>',
  },
};

export function dynamicValuesForRole(role: DocsRoleKey): DynamicValueMap {
  return {
    ...DEFAULT_DYNAMIC_VALUES,
    ...(ROLE_DYNAMIC_OVERRIDES[role] ?? {}),
  };
}

export { HELP_MODULE_SLUGS };

/**
 * Pick the best known id for a concrete path template.
 * Falls back to the generic segment name (id, employeeId, …).
 */
export function resolveSegmentValue(
  routePattern: string,
  segment: string,
  values: DynamicValueMap,
): string | undefined {
  const path = routePattern.toLowerCase();
  if (segment === 'module') {
    return undefined; // expanded separately into help slugs
  }
  if (segment === 'month' || segment === 'year') {
    return values[segment];
  }
  if (segment === 'employeeId') {
    return values.employeeId;
  }
  if (segment === 'projectId') {
    return values.projectId;
  }
  if (segment === 'packageId' || segment === 'taskDisciplineId') {
    return values[segment];
  }
  if (segment === 'id') {
    if (path.includes('/hr/leave-requests')) return values['leave-request-id'];
    if (path.includes('/hr/overtime')) return values['overtime-id'];
    if (path.includes('/hr/expense-claims')) return values['expense-id'];
    if (path.includes('/hr/per-diem')) return values['per-diem-id'];
    if (path.includes('/approvals/')) return values['approval-id'];
    if (path.includes('/hr/employee-contract')) return values['contract-id'];
    if (path.includes('/hr/leave-policy')) return values['leave-policy-id'];
    if (path.includes('/hr/work-schedules')) return values['work-schedule-id'];
    if (path.includes('/hr/public-holidays')) return values['holiday-id'];
    if (path.includes('/hr/payroll')) return values['payroll-id'];
    if (path.includes('/hr/site-assignments')) return values['site-assignment-id'];
    if (path.includes('/hr/flight-applications')) return values['flight-id'];
    if (path.includes('/hr/business-trips')) return values['business-trip-id'];
    if (path.includes('/audit-logs')) return values['audit-log-id'];
    if (path.includes('/users/')) return values['user-id'];
    if (path.includes('/organization/vehicles')) return values['vehicle-id'];
    if (path.includes('/announcements')) return values['announcement-id'];
    return values.id;
  }
  return values[segment];
}
