/**
 * Role -> dashboard tab resolution for the home dashboard.
 *
 * Roles are matched on their DB `name` (case-insensitive) and on session
 * capabilities. Matching is for presentation only: every tab's data comes from
 * `GET /dashboard/stats`, which the API scopes per caller, so hiding or
 * showing a tab never grants access to anything.
 */

/** Role names that get the company-wide HR tabs. */
export const HR_ROLE_NAMES: readonly string[] = [
  'HR Manager',
  'HR Officer',
  'HR Assistant',
  'Local HR Manager',
  'System Administrator',
  'General Manager',
  'Managing Director',
];

/** Role names that get the "My Team" tab even before team data loads. */
export const SUPERVISOR_ROLE_NAMES: readonly string[] = [
  'Supervisor',
  'Team Lead',
  'Department Head',
  'Discipline Lead',
  'Discipline Leader',
];

export const DASHBOARD_TAB_IDS = [
  'overview',
  'payroll-ot',
  'operations',
  'my-team',
  'my-work',
] as const;

export type DashboardTabId = (typeof DASHBOARD_TAB_IDS)[number];

function normalizeRoleName(name: string): string {
  return name.trim().toLowerCase();
}

function hasRoleIn(
  roleNames: readonly string[],
  allowed: readonly string[],
): boolean {
  const allowedSet = new Set(allowed.map(normalizeRoleName));
  return roleNames.some((name) => allowedSet.has(normalizeRoleName(name)));
}

/** True when the viewer should see the HR tabs. */
export function isHrDashboardUser(
  roleNames: readonly string[],
  canViewHr: boolean,
): boolean {
  return canViewHr || hasRoleIn(roleNames, HR_ROLE_NAMES);
}

/** True when the viewer should see the My Team tab. */
export function isSupervisorDashboardUser(
  roleNames: readonly string[],
  hasTeam: boolean,
): boolean {
  return hasTeam || hasRoleIn(roleNames, SUPERVISOR_ROLE_NAMES);
}

/**
 * Tabs for the viewer, in display order. The set is the union of the
 * matching role groups; "My Work" is always present and always last.
 */
export function resolveDashboardTabs(input: {
  roleNames: string[];
  canViewHr: boolean;
  hasTeam: boolean;
}): DashboardTabId[] {
  const tabs: DashboardTabId[] = [];
  if (isHrDashboardUser(input.roleNames, input.canViewHr)) {
    tabs.push('overview', 'payroll-ot', 'operations');
  }
  if (isSupervisorDashboardUser(input.roleNames, input.hasTeam)) {
    tabs.push('my-team');
  }
  tabs.push('my-work');
  return tabs;
}

/** Type guard: `id` is a known tab AND is available in `tabs`. */
export function isValidTab(
  id: string | null | undefined,
  tabs: readonly DashboardTabId[],
): id is DashboardTabId {
  if (!id) {
    return false;
  }
  return (tabs as readonly string[]).includes(id);
}
