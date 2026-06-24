import type { PmModuleKey } from '@/lib/api/project-management.types';

/** Capability module required to view a nav item; `projects` = any project access. */
export type ProjectNavCapability = PmModuleKey | 'projects';

export interface ProjectWorkspaceNavItem {
  readonly key: string;
  readonly label: string;
  /** i18n key under `epc.json` (e.g. `workspace.items.disciplines`). */
  readonly labelKey: string;
  /** Icon registry key - defaults to `key` when omitted. */
  readonly iconKey?: string;
  /** Path after `/projects/{projectId}/`; empty string = dashboard root. */
  readonly pathSuffix: string;
  readonly capability: ProjectNavCapability;
  readonly breadcrumbGroup: string;
  readonly breadcrumbGroupKey: string;
  /** When set, item also requires the matching EPC probe. */
  readonly epcSurface?: 'engineering';
  /** When set, item also requires the matching EPC workspace capability. */
  readonly epcCapability?: 'reviewInbox' | 'myComments';
}

export interface ProjectWorkspaceNavGroup {
  readonly key: string;
  readonly label: string;
  readonly labelKey: string;
  readonly items: readonly ProjectWorkspaceNavItem[];
}

export const PROJECT_WORKSPACE_NAV: readonly ProjectWorkspaceNavGroup[] = [
  {
    key: 'overview',
    label: 'Overview',
    labelKey: 'workspace.groups.overview',
    items: [
      {
        key: 'dashboard',
        label: 'Dashboard',
        labelKey: 'workspace.items.dashboard',
        iconKey: 'dashboard',
        pathSuffix: '',
        capability: 'projects',
        breadcrumbGroup: 'Overview',
        breadcrumbGroupKey: 'workspace.groups.overview',
      },
      {
        key: 'status-board',
        label: 'Status Board',
        labelKey: 'workspace.items.statusBoard',
        pathSuffix: 'overview/status',
        capability: 'schedule',
        breadcrumbGroup: 'Overview',
        breadcrumbGroupKey: 'workspace.groups.overview',
        epcSurface: 'engineering',
      },
      {
        key: 'workload',
        label: 'Workload',
        labelKey: 'workspace.items.workload',
        pathSuffix: 'overview/workload',
        capability: 'schedule',
        breadcrumbGroup: 'Overview',
        breadcrumbGroupKey: 'workspace.groups.overview',
        epcSurface: 'engineering',
      },
    ],
  },
  {
    key: 'engineering',
    label: 'Engineering',
    labelKey: 'workspace.groups.engineering',
    items: [
      {
        key: 'schedule',
        label: 'Schedule & Tasks',
        labelKey: 'workspace.items.schedule',
        pathSuffix: 'schedule',
        capability: 'schedule',
        breadcrumbGroup: 'Engineering',
        breadcrumbGroupKey: 'workspace.groups.engineering',
      },
      {
        key: 'disciplines',
        label: 'Disciplines & Packages',
        labelKey: 'workspace.items.disciplines',
        pathSuffix: 'disciplines',
        capability: 'schedule',
        breadcrumbGroup: 'Engineering',
        breadcrumbGroupKey: 'workspace.groups.engineering',
        epcSurface: 'engineering',
      },
      {
        key: 'deliverables',
        label: 'Deliverables',
        labelKey: 'workspace.items.deliverables',
        pathSuffix: 'deliverables',
        capability: 'schedule',
        breadcrumbGroup: 'Engineering',
        breadcrumbGroupKey: 'workspace.groups.engineering',
        epcSurface: 'engineering',
      },
    ],
  },
  {
    key: 'review-release',
    label: 'Review & Release',
    labelKey: 'workspace.groups.reviewRelease',
    items: [
      {
        key: 'submittals',
        label: 'Submittals',
        labelKey: 'workspace.items.submittals',
        pathSuffix: 'submittals',
        capability: 'submittals',
        breadcrumbGroup: 'Review & Release',
        breadcrumbGroupKey: 'workspace.groups.reviewRelease',
      },
      {
        key: 'external-release',
        label: 'External Release',
        labelKey: 'workspace.items.externalRelease',
        pathSuffix: 'submittals/external-release',
        capability: 'submittals',
        breadcrumbGroup: 'Review & Release',
        breadcrumbGroupKey: 'workspace.groups.reviewRelease',
        epcSurface: 'engineering',
      },
      {
        key: 'review-inbox',
        label: 'Review Inbox',
        labelKey: 'workspace.items.reviewInbox',
        iconKey: 'review-inbox',
        pathSuffix: 'review-inbox',
        capability: 'schedule',
        breadcrumbGroup: 'Review & Release',
        breadcrumbGroupKey: 'workspace.groups.reviewRelease',
        epcCapability: 'reviewInbox',
      },
      {
        key: 'my-comments',
        label: 'My Comments',
        labelKey: 'workspace.items.myComments',
        iconKey: 'my-comments',
        pathSuffix: 'my-comments',
        capability: 'schedule',
        breadcrumbGroup: 'Review & Release',
        breadcrumbGroupKey: 'workspace.groups.reviewRelease',
        epcCapability: 'myComments',
      },
    ],
  },
  {
    key: 'site-ops',
    label: 'Site Operations',
    labelKey: 'workspace.groups.siteOps',
    items: [
      {
        key: 'rfis',
        label: 'RFIs',
        labelKey: 'workspace.items.rfis',
        pathSuffix: 'rfis',
        capability: 'rfis',
        breadcrumbGroup: 'Site Operations',
        breadcrumbGroupKey: 'workspace.groups.siteOps',
      },
      {
        key: 'issues',
        label: 'Issues',
        labelKey: 'workspace.items.issues',
        pathSuffix: 'issues',
        capability: 'issues',
        breadcrumbGroup: 'Site Operations',
        breadcrumbGroupKey: 'workspace.groups.siteOps',
      },
      {
        key: 'daily-logs',
        label: 'Daily Logs',
        labelKey: 'workspace.items.dailyLogs',
        pathSuffix: 'daily-logs',
        capability: 'dailyLogs',
        breadcrumbGroup: 'Site Operations',
        breadcrumbGroupKey: 'workspace.groups.siteOps',
      },
      {
        key: 'meetings',
        label: 'Meetings',
        labelKey: 'workspace.items.meetings',
        pathSuffix: 'meetings',
        capability: 'meetings',
        breadcrumbGroup: 'Site Operations',
        breadcrumbGroupKey: 'workspace.groups.siteOps',
      },
      {
        key: 'correspondence',
        label: 'Correspondence',
        labelKey: 'workspace.items.correspondence',
        pathSuffix: 'correspondence',
        capability: 'correspondence',
        breadcrumbGroup: 'Site Operations',
        breadcrumbGroupKey: 'workspace.groups.siteOps',
      },
      {
        key: 'risks',
        label: 'Risks',
        labelKey: 'workspace.items.risks',
        pathSuffix: 'risks',
        capability: 'risks',
        breadcrumbGroup: 'Site Operations',
        breadcrumbGroupKey: 'workspace.groups.siteOps',
      },
      {
        key: 'punch-list',
        label: 'Punch List',
        labelKey: 'workspace.items.punchList',
        pathSuffix: 'punch-list',
        capability: 'punchItems',
        breadcrumbGroup: 'Site Operations',
        breadcrumbGroupKey: 'workspace.groups.siteOps',
      },
    ],
  },
  {
    key: 'records',
    label: 'Project Records',
    labelKey: 'workspace.groups.records',
    items: [
      {
        key: 'documents',
        label: 'Documents',
        labelKey: 'workspace.items.documents',
        pathSuffix: 'documents',
        capability: 'projects',
        breadcrumbGroup: 'Project Records',
        breadcrumbGroupKey: 'workspace.groups.records',
      },
      {
        key: 'team',
        label: 'Team',
        labelKey: 'workspace.items.team',
        pathSuffix: 'team',
        capability: 'projects',
        breadcrumbGroup: 'Project Records',
        breadcrumbGroupKey: 'workspace.groups.records',
      },
      {
        key: 'closeout',
        label: 'Closeout',
        labelKey: 'workspace.items.closeout',
        pathSuffix: 'closeout',
        capability: 'closeout',
        breadcrumbGroup: 'Project Records',
        breadcrumbGroupKey: 'workspace.groups.records',
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
 * Disciplines list for a project.
 */
export function projectDisciplinesHref(projectId: string): string {
  return projectNavHref(projectId, 'disciplines');
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
): { group: string; page: string; groupKey: string; pageKey: string } | null {
  const key = resolveProjectNavKey(pathname, projectId);
  const item = flattenProjectNavItems().find((entry) => entry.key === key);
  if (!item) {
    return null;
  }
  return {
    group: item.breadcrumbGroup,
    page: item.label,
    groupKey: item.breadcrumbGroupKey,
    pageKey: item.labelKey,
  };
}
