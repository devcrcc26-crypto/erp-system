/**
 * First-login product tour: role groups and their steps.
 *
 * Steps target `data-tour="…"` attributes (stable across styling changes):
 *   sidebar-dashboard, sidebar-hr, sidebar-approvals, sidebar-projects
 *     -> `tourId` on entries in components/sidebar/sidebar.config.ts
 *   topbar-notifications -> bell in components/ui/NotificationPanel/NotificationPanel.tsx
 *   topbar-profile       -> avatar in components/ui/PageHeader/HeaderActions.tsx
 *
 * Copy lives in locales/{en,zh}/tour.json (served under the `tour.` prefix).
 */

export type TourRoleGroup = 'hr' | 'management' | 'project' | 'employee';

export type TourTarget =
  | 'sidebar-dashboard'
  | 'sidebar-hr'
  | 'sidebar-approvals'
  | 'sidebar-projects'
  | 'topbar-notifications'
  | 'topbar-profile';

interface TourStepDefinition {
  readonly target: TourTarget;
  /** Key prefix in tour.json; `.title` and `.description` are appended. */
  readonly key: string;
}

export interface TourStep {
  readonly element: string;
  readonly title: string;
  readonly description: string;
}

const MANAGEMENT_ROLES = new Set(['managing director', 'general manager', 'department head']);

const PROJECT_ROLES = new Set([
  'designer',
  'reviewer',
  'discipline lead',
  'discipline leader',
  'project administrator',
]);

/**
 * Role group from the user's primary role name (falls back to the employee
 * group). HR is any role containing "HR" as a word or "Human Resources".
 */
export function resolveTourRoleGroup(roleName: string | null | undefined): TourRoleGroup {
  const name = (roleName ?? '').trim();
  if (!name) {
    return 'employee';
  }
  if (/\bHR\b/i.test(name) || /human resources/i.test(name)) {
    return 'hr';
  }
  const normalized = name.toLowerCase();
  if (MANAGEMENT_ROLES.has(normalized)) {
    return 'management';
  }
  if (PROJECT_ROLES.has(normalized)) {
    return 'project';
  }
  return 'employee';
}

const TOUR_DEFINITIONS: Record<TourRoleGroup, readonly TourStepDefinition[]> = {
  hr: [
    { target: 'sidebar-hr', key: 'tour.hr.hr' },
    { target: 'sidebar-approvals', key: 'tour.hr.approvals' },
    { target: 'topbar-notifications', key: 'tour.hr.notifications' },
    { target: 'topbar-profile', key: 'tour.hr.profile' },
  ],
  management: [
    { target: 'sidebar-dashboard', key: 'tour.management.dashboard' },
    { target: 'sidebar-approvals', key: 'tour.management.approvals' },
    { target: 'topbar-notifications', key: 'tour.management.notifications' },
    { target: 'topbar-profile', key: 'tour.management.profile' },
  ],
  project: [
    { target: 'sidebar-projects', key: 'tour.project.projects' },
    { target: 'sidebar-approvals', key: 'tour.project.approvals' },
    { target: 'topbar-notifications', key: 'tour.project.notifications' },
    { target: 'topbar-profile', key: 'tour.project.profile' },
  ],
  employee: [
    { target: 'sidebar-approvals', key: 'tour.employee.approvals' },
    { target: 'topbar-notifications', key: 'tour.employee.notifications' },
    { target: 'topbar-profile', key: 'tour.employee.profile' },
  ],
};

export function tourSelector(target: TourTarget): string {
  return `[data-tour="${target}"]`;
}

/** Translated steps for a role group (unfiltered; AppTour drops missing elements). */
export function buildTourSteps(
  group: TourRoleGroup,
  t: (key: string) => string,
): TourStep[] {
  return TOUR_DEFINITIONS[group].map(({ target, key }) => ({
    element: tourSelector(target),
    title: t(`${key}.title`),
    description: t(`${key}.description`),
  }));
}
