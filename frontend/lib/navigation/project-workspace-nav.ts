import type { PmModuleKey } from '@/lib/api/project-management.types';

/** Capability module required to view a nav item; `projects` = any project access. */
export type ProjectNavCapability = PmModuleKey | 'projects';

export interface ProjectWorkspaceNavItem {
  readonly key: string;
  readonly label: string;
  /** Path after `/projects/{projectId}/`; empty string = dashboard root. */
  readonly pathSuffix: string;
  readonly capability: ProjectNavCapability;
  readonly breadcrumbGroup: string;
}

export interface ProjectWorkspaceNavGroup {
  readonly key: string;
  readonly label: string;
  readonly items: readonly ProjectWorkspaceNavItem[];
}

export const PROJECT_WORKSPACE_NAV: readonly ProjectWorkspaceNavGroup[] = [
  {
    key: 'overview',
    label: 'Overview',
    items: [
      {
        key: 'dashboard',
        label: 'Dashboard',
        pathSuffix: '',
        capability: 'projects',
        breadcrumbGroup: 'Overview',
      },
      {
        key: 'status-board',
        label: 'Status Board',
        pathSuffix: 'overview/status',
        capability: 'schedule',
        breadcrumbGroup: 'Overview',
      },
      {
        key: 'workload',
        label: 'Workload',
        pathSuffix: 'overview/workload',
        capability: 'schedule',
        breadcrumbGroup: 'Overview',
      },
    ],
  },
  {
    key: 'engineering',
    label: 'Engineering',
    items: [
      {
        key: 'schedule',
        label: 'Schedule & Tasks',
        pathSuffix: 'schedule',
        capability: 'schedule',
        breadcrumbGroup: 'Engineering',
      },
      {
        key: 'disciplines',
        label: 'Disciplines & Packages',
        pathSuffix: 'disciplines',
        capability: 'schedule',
        breadcrumbGroup: 'Engineering',
      },
      {
        key: 'deliverables',
        label: 'Deliverables',
        pathSuffix: 'deliverables',
        capability: 'schedule',
        breadcrumbGroup: 'Engineering',
      },
    ],
  },
  {
    key: 'review-release',
    label: 'Review & Release',
    items: [
      {
        key: 'submittals',
        label: 'Submittals',
        pathSuffix: 'submittals',
        capability: 'submittals',
        breadcrumbGroup: 'Review & Release',
      },
    ],
  },
  {
    key: 'site-ops',
    label: 'Site Operations',
    items: [
      {
        key: 'rfis',
        label: 'RFIs',
        pathSuffix: 'rfis',
        capability: 'rfis',
        breadcrumbGroup: 'Site Operations',
      },
      {
        key: 'issues',
        label: 'Issues',
        pathSuffix: 'issues',
        capability: 'issues',
        breadcrumbGroup: 'Site Operations',
      },
      {
        key: 'daily-logs',
        label: 'Daily Logs',
        pathSuffix: 'daily-logs',
        capability: 'dailyLogs',
        breadcrumbGroup: 'Site Operations',
      },
      {
        key: 'meetings',
        label: 'Meetings',
        pathSuffix: 'meetings',
        capability: 'meetings',
        breadcrumbGroup: 'Site Operations',
      },
      {
        key: 'correspondence',
        label: 'Correspondence',
        pathSuffix: 'correspondence',
        capability: 'correspondence',
        breadcrumbGroup: 'Site Operations',
      },
      {
        key: 'risks',
        label: 'Risks',
        pathSuffix: 'risks',
        capability: 'risks',
        breadcrumbGroup: 'Site Operations',
      },
      {
        key: 'punch-list',
        label: 'Punch List',
        pathSuffix: 'punch-list',
        capability: 'punchItems',
        breadcrumbGroup: 'Site Operations',
      },
    ],
  },
  {
    key: 'records',
    label: 'Project Records',
    items: [
      {
        key: 'documents',
        label: 'Documents',
        pathSuffix: 'documents',
        capability: 'projects',
        breadcrumbGroup: 'Project Records',
      },
      {
        key: 'drawings',
        label: 'Drawings',
        pathSuffix: 'drawings',
        capability: 'drawings',
        breadcrumbGroup: 'Project Records',
      },
      {
        key: 'team',
        label: 'Team',
        pathSuffix: 'team',
        capability: 'projects',
        breadcrumbGroup: 'Project Records',
      },
      {
        key: 'closeout',
        label: 'Closeout',
        pathSuffix: 'closeout',
        capability: 'closeout',
        breadcrumbGroup: 'Project Records',
      },
    ],
  },
] as const;

/**
 * Builds the full href for a project workspace nav item.
 */
export function projectNavHref(projectId: string, pathSuffix: string): string {
  if (!pathSuffix) {
    return `/projects/${projectId}`;
  }
  return `/projects/${projectId}/${pathSuffix}`;
}

/**
 * Flat list of all nav items for active-key and breadcrumb resolution.
 */
export function flattenProjectNavItems(): ProjectWorkspaceNavItem[] {
  return PROJECT_WORKSPACE_NAV.flatMap((group) => [...group.items]);
}

/**
 * Resolves the active nav item key from the current pathname.
 */
export function resolveProjectNavKey(pathname: string, projectId: string): string {
  const base = `/projects/${projectId}`;
  const items = flattenProjectNavItems().sort(
    (a, b) => b.pathSuffix.length - a.pathSuffix.length,
  );

  for (const item of items) {
    const href = projectNavHref(projectId, item.pathSuffix);
    if (item.pathSuffix === '') {
      if (pathname === base || pathname === `${base}/`) {
        return item.key;
      }
      continue;
    }
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      return item.key;
    }
  }

  return 'dashboard';
}

/**
 * Breadcrumb segment for the active project page (group + page label).
 */
export function resolveProjectBreadcrumb(
  pathname: string,
  projectId: string,
): { group: string; page: string } | null {
  const key = resolveProjectNavKey(pathname, projectId);
  const item = flattenProjectNavItems().find((entry) => entry.key === key);
  if (!item) {
    return null;
  }
  return { group: item.breadcrumbGroup, page: item.label };
}
