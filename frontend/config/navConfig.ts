import type { ReactNode } from 'react';
import {
  resolveProjectBreadcrumb,
  resolveProjectNavKey,
  flattenProjectNavItems,
  projectNavHref,
  PROJECT_WORKSPACE_NAV,
  type ProjectWorkspaceNavGroup,
} from '@/lib/navigation/project-workspace-nav';

export type { ProjectWorkspaceNavGroup };

export interface IconRailItem {
  readonly key: string;
  readonly labelKey: string;
  readonly href: string;
  readonly iconKey: string;
  readonly visible: boolean;
}

export interface IconRailGroup {
  readonly key: string;
  readonly labelKey: string;
  /** localStorage key for collapsed/expanded persistence */
  readonly storageKey: string;
  readonly defaultOpen: boolean;
  readonly items: readonly IconRailItem[];
}

export interface IconRailNavStructure {
  /** Items rendered above collapsible groups (e.g. Dashboard). */
  readonly topItems: readonly IconRailItem[];
  readonly groups: readonly IconRailGroup[];
  readonly standalone: readonly IconRailItem[];
}

export interface BreadcrumbSegment {
  readonly label: string;
  readonly href?: string;
}

export interface RouteMeta {
  readonly titleKey: string;
  readonly breadcrumbs: readonly BreadcrumbSegment[];
}

const PAGE_TITLE_KEYS: Record<string, string> = {
  '/': 'nav.dashboard',
  '/projects': 'nav.projects',
  '/kanban-board': 'nav.kanbanBoard',
  '/review-inbox': 'pages.reviewInbox.title',
  '/my-comments': 'pages.myComments.title',
  '/my-work': 'pages.myWork.title',
  '/submittals': 'nav.submittals',
  '/external-releases': 'nav.externalReleases',
  '/change-requests': 'nav.changeRequests',
  '/rfis': 'nav.rfis',
  '/issues': 'nav.issues',
  '/risks': 'nav.risks',
  '/punch-list': 'nav.punchList',
  '/correspondence': 'nav.correspondence',
  '/daily-logs': 'nav.dailyLogs',
  '/approvals': 'nav.approvals',
  '/users': 'nav.users',
  '/teams': 'nav.teams',
  '/reports': 'nav.reports',
  '/messages': 'nav.messages',
  '/settings': 'nav.settings',
  '/profile': 'nav.profile',
  '/audit-logs': 'nav.auditLogs',
  '/departments': 'pages.departments.title',
  '/positions': 'pages.positions.title',
  '/disciplines': 'pages.disciplinesCatalog.title',
  '/hr/leave-requests': 'nav.hr.leaveRequests',
  '/hr/overtime': 'nav.hr.overtime',
  '/hr/expense-claims': 'nav.hr.expenseClaims',
  '/hr/purchase-requests': 'nav.hr.purchaseRequests',
  '/hr/material-requisition': 'nav.hr.materialRequisition',
  '/hr/consumables': 'nav.hr.consumables',
  '/hr/flight-applications': 'nav.hr.flightApplications',
  '/hr/vehicle-applications': 'nav.hr.vehicleApplications',
  '/hr/official-seal': 'nav.hr.officialSeal',
  '/hr/project-seal': 'nav.hr.projectSeal',
  '/hr/vehicle-refueling': 'nav.hr.vehicleRefueling',
  '/hr/inspection-repair': 'nav.hr.inspectionRepair',
  '/hr/business-trips': 'nav.hr.businessTrips',
};

export interface IconRailVisibility {
  canViewReviewInbox: boolean;
  canViewMyComments: boolean;
  canViewMyWork: boolean;
  canViewSubmittals: boolean;
  canViewExternalReleases: boolean;
  canViewChangeRequests: boolean;
  canViewRfis: boolean;
  canViewIssues: boolean;
  canViewRisks: boolean;
  canViewPunchList: boolean;
  canViewMeetings: boolean;
  canViewCorrespondence: boolean;
  canViewDailyLogs: boolean;
  canViewApprovals: boolean;
  canViewHr: boolean;
  canAccessLeave: boolean;
  canAccessOvertime: boolean;
  canViewAuditLogs: boolean;
  canManageUsers: boolean;
  canManageRoles: boolean;
  canViewProjects: boolean;
  canViewDepartments: boolean;
  canViewPositions: boolean;
  canViewDisciplinesCatalog: boolean;
}

/**
 * Domain-grouped main navigation: PM + HR collapsible groups, plus standalone items.
 */
export function buildIconRailNav(
  visibility: IconRailVisibility,
): IconRailNavStructure {
  const {
    canViewReviewInbox,
    canViewMyComments,
    canViewMyWork,
    canViewSubmittals,
    canViewExternalReleases,
    canViewChangeRequests,
    canViewRfis,
    canViewIssues,
    canViewRisks,
    canViewPunchList,
    canViewMeetings,
    canViewCorrespondence,
    canViewDailyLogs,
    canViewApprovals,
    canViewHr,
    canAccessLeave,
    canAccessOvertime,
    canViewAuditLogs,
    canManageUsers,
    canManageRoles,
    canViewProjects,
    canViewDepartments,
    canViewPositions,
    canViewDisciplinesCatalog,
  } = visibility;

  const topItems: IconRailItem[] = [
    {
      key: '/',
      labelKey: 'nav.dashboard',
      href: '/',
      iconKey: 'dashboard',
      visible: true,
    },
  ];

  const projectManagement: IconRailGroup = {
    key: 'pm',
    labelKey: 'nav.groups.projectManagement',
    storageKey: 'sidebar_pm_open',
    defaultOpen: true,
    items: [
      {
        key: '/projects',
        labelKey: 'nav.projects',
        href: '/projects',
        iconKey: 'projects',
        visible: canViewProjects,
      },
      {
        key: '/review-inbox',
        labelKey: 'nav.reviewInbox',
        href: '/review-inbox',
        iconKey: 'review-inbox',
        visible: canViewReviewInbox,
      },
      {
        key: '/my-comments',
        labelKey: 'nav.myComments',
        href: '/my-comments',
        iconKey: 'my-comments',
        visible: canViewMyComments,
      },
      {
        key: '/my-work',
        labelKey: 'nav.myWork',
        href: '/my-work',
        iconKey: 'my-work',
        visible: canViewMyWork,
      },
      {
        key: '/submittals',
        labelKey: 'nav.submittals',
        href: '/submittals',
        iconKey: 'submittals',
        visible: canViewSubmittals,
      },
      {
        key: '/external-releases',
        labelKey: 'nav.externalReleases',
        href: '/external-releases',
        iconKey: 'external-release',
        visible: canViewExternalReleases,
      },
      {
        key: '/change-requests',
        labelKey: 'nav.changeRequests',
        href: '/change-requests',
        iconKey: 'change-requests',
        visible: canViewChangeRequests,
      },
      {
        key: '/rfis',
        labelKey: 'nav.rfis',
        href: '/rfis',
        iconKey: 'rfis',
        visible: canViewRfis,
      },
      {
        key: '/issues',
        labelKey: 'nav.issues',
        href: '/issues',
        iconKey: 'issues',
        visible: canViewIssues,
      },
      {
        key: '/risks',
        labelKey: 'nav.risks',
        href: '/risks',
        iconKey: 'risks',
        visible: canViewRisks,
      },
      {
        key: '/punch-list',
        labelKey: 'nav.punchList',
        href: '/punch-list',
        iconKey: 'punch-list',
        visible: canViewPunchList,
      },
      {
        key: '/meetings',
        labelKey: 'nav.meetings',
        href: '/meetings',
        iconKey: 'meetings',
        visible: canViewMeetings,
      },
      {
        key: '/correspondence',
        labelKey: 'nav.correspondence',
        href: '/correspondence',
        iconKey: 'correspondence',
        visible: canViewCorrespondence,
      },
      {
        key: '/daily-logs',
        labelKey: 'nav.dailyLogs',
        href: '/daily-logs',
        iconKey: 'daily-logs',
        visible: canViewDailyLogs,
      },
      {
        key: '/kanban-board',
        labelKey: 'nav.kanbanBoard',
        href: '/kanban-board',
        iconKey: 'kanban',
        visible: canViewProjects,
      },
      {
        key: '/reports',
        labelKey: 'nav.reports',
        href: '/reports',
        iconKey: 'reports',
        visible: canViewProjects,
      },
    ],
  };

  const humanResources: IconRailGroup = {
    key: 'hr',
    labelKey: 'nav.groups.humanResources',
    storageKey: 'sidebar_hr_open',
    defaultOpen: true,
    items: [
      {
        key: '/users',
        labelKey: 'nav.users',
        href: '/users',
        iconKey: 'users',
        visible: canManageUsers,
      },
      {
        key: '/departments',
        labelKey: 'nav.departments',
        href: '/departments',
        iconKey: 'departments',
        visible: canViewDepartments,
      },
      {
        key: '/positions',
        labelKey: 'nav.positions',
        href: '/positions',
        iconKey: 'positions',
        visible: canViewPositions,
      },
      {
        key: '/disciplines',
        labelKey: 'nav.disciplinesCatalog',
        href: '/disciplines',
        iconKey: 'disciplines-catalog',
        visible: canViewDisciplinesCatalog,
      },
      {
        key: '/hr/leave-requests',
        labelKey: 'nav.hr.leaveRequests',
        href: '/hr/leave-requests',
        iconKey: 'hr-leave',
        visible: canAccessLeave,
      },
      {
        key: '/hr/overtime',
        labelKey: 'nav.hr.overtime',
        href: '/hr/overtime',
        iconKey: 'hr-overtime',
        visible: canAccessOvertime,
      },
      {
        key: '/hr/expense-claims',
        labelKey: 'nav.hr.expenseClaims',
        href: '/hr/expense-claims',
        iconKey: 'hr-expense',
        visible: canViewHr,
      },
      {
        key: '/hr/purchase-requests',
        labelKey: 'nav.hr.purchaseRequests',
        href: '/hr/purchase-requests',
        iconKey: 'hr-purchase',
        visible: canViewHr,
      },
      {
        key: '/hr/material-requisition',
        labelKey: 'nav.hr.materialRequisition',
        href: '/hr/material-requisition',
        iconKey: 'hr-material',
        visible: canViewHr,
      },
      {
        key: '/hr/consumables',
        labelKey: 'nav.hr.consumables',
        href: '/hr/consumables',
        iconKey: 'hr-consumables',
        visible: canViewHr,
      },
      {
        key: '/hr/flight-applications',
        labelKey: 'nav.hr.flightApplications',
        href: '/hr/flight-applications',
        iconKey: 'hr-flight',
        visible: canViewHr,
      },
      {
        key: '/hr/vehicle-applications',
        labelKey: 'nav.hr.vehicleApplications',
        href: '/hr/vehicle-applications',
        iconKey: 'hr-vehicle',
        visible: canViewHr,
      },
      {
        key: '/hr/official-seal',
        labelKey: 'nav.hr.officialSeal',
        href: '/hr/official-seal',
        iconKey: 'hr-official-seal',
        visible: canViewHr,
      },
      {
        key: '/hr/project-seal',
        labelKey: 'nav.hr.projectSeal',
        href: '/hr/project-seal',
        iconKey: 'hr-project-seal',
        visible: canViewHr,
      },
      {
        key: '/hr/vehicle-refueling',
        labelKey: 'nav.hr.vehicleRefueling',
        href: '/hr/vehicle-refueling',
        iconKey: 'hr-refueling',
        visible: canViewHr,
      },
      {
        key: '/hr/inspection-repair',
        labelKey: 'nav.hr.inspectionRepair',
        href: '/hr/inspection-repair',
        iconKey: 'hr-inspection',
        visible: canViewHr,
      },
      {
        key: '/hr/business-trips',
        labelKey: 'nav.hr.businessTrips',
        href: '/hr/business-trips',
        iconKey: 'hr-business-trip',
        visible: canViewHr,
      },
    ],
  };

  const standalone: IconRailItem[] = [
    {
      key: '/approvals',
      labelKey: 'nav.approvals',
      href: '/approvals',
      iconKey: 'approvals',
      visible: canViewApprovals,
    },
    {
      key: '/audit-logs',
      labelKey: 'nav.auditLogs',
      href: '/audit-logs',
      iconKey: 'audit-logs',
      visible: canViewAuditLogs,
    },
    {
      key: '/settings',
      labelKey: 'nav.settings',
      href: '/settings',
      iconKey: 'settings',
      visible: canManageRoles,
    },
  ];

  return {
    topItems,
    groups: [projectManagement, humanResources],
    standalone,
  };
}

/**
 * Flat list of all rail items (top, groups, then standalone) for active-key resolution.
 */
export function flattenIconRailNav(
  structure: IconRailNavStructure,
): IconRailItem[] {
  return [
    ...structure.topItems,
    ...structure.groups.flatMap((group) => group.items),
    ...structure.standalone,
  ];
}

/**
 * @deprecated Prefer `buildIconRailNav` + `flattenIconRailNav`.
 */
export function buildIconRailItems(
  visibility: IconRailVisibility,
): IconRailItem[] {
  return flattenIconRailNav(buildIconRailNav(visibility));
}

/** Context sidebar section config - sourced from project workspace nav. */
export const contextNavSections: readonly ProjectWorkspaceNavGroup[] =
  PROJECT_WORKSPACE_NAV;

export { projectNavHref, resolveProjectNavKey, flattenProjectNavItems };

const PROJECT_ID_PATTERN = /^\/projects\/([^/]+)/;

/**
 * Extracts project id from a pathname when on a project route.
 */
export function extractProjectId(pathname: string): string | null {
  const match = PROJECT_ID_PATTERN.exec(pathname);
  return match?.[1] ?? null;
}

/**
 * Whether the context (project) sidebar should render for this route.
 */
export function shouldShowContextSidebar(pathname: string): boolean {
  return extractProjectId(pathname) !== null;
}

function pathMatchesHref(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Resolves the active icon rail key from the current pathname.
 */
export function resolveIconRailKey(
  pathname: string,
  visibleItems: IconRailItem[],
): string {
  if (pathname === '/profile') {
    return '/profile';
  }

  let best: IconRailItem | undefined;
  for (const item of visibleItems) {
    if (!pathMatchesHref(pathname, item.href)) {
      continue;
    }
    if (!best || item.href.length > best.href.length) {
      best = item;
    }
  }

  return best?.key ?? '/';
}

/**
 * Route-driven page title key and breadcrumb segments.
 */
export function resolveRouteMeta(
  pathname: string,
  projectName: string | null,
  t: (key: string) => string,
): RouteMeta {
  const projectId = extractProjectId(pathname);

  if (projectId) {
    const projectCrumb = projectName ?? t('nav.projects');
    const projectHref = `/projects/${projectId}`;
    const breadcrumb = resolveProjectBreadcrumb(pathname, projectId);

    if (breadcrumb) {
      return {
        titleKey: breadcrumb.pageKey,
        breadcrumbs: [
          { label: t('nav.projects'), href: '/projects' },
          { label: projectCrumb, href: projectHref },
          { label: t(breadcrumb.groupKey) },
          { label: t(breadcrumb.pageKey) },
        ],
      };
    }

    return {
      titleKey: 'nav.dashboard',
      breadcrumbs: [
        { label: t('nav.projects'), href: '/projects' },
        { label: projectCrumb },
      ],
    };
  }

  if (pathname.startsWith('/design-packages')) {
    return {
      titleKey: 'pages.reviewMode.title',
      breadcrumbs: [
        { label: t('nav.projects'), href: '/projects' },
        { label: t('pages.reviewMode.title') },
      ],
    };
  }

  if (pathname === '/approvals/new') {
    return {
      titleKey: 'pages.approvals.new',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.approvals'), href: '/approvals' },
        { label: t('pages.approvals.new') },
      ],
    };
  }

  if (pathname.startsWith('/approvals/')) {
    return {
      titleKey: 'nav.approvals',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.approvals'), href: '/approvals' },
        { label: t('pages.approvals.detail') },
      ],
    };
  }

  if (pathname === '/hr/leave-requests/new') {
    return {
      titleKey: 'nav.hr.leaveRequests',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.leaveRequests'), href: '/hr/leave-requests' },
      ],
    };
  }

  if (pathname.startsWith('/hr/leave-requests/')) {
    return {
      titleKey: 'pages.hr.leave.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.leaveRequests'), href: '/hr/leave-requests' },
        { label: t('pages.hr.leave.detail') },
      ],
    };
  }

  if (pathname === '/hr/overtime/new') {
    return {
      titleKey: 'nav.hr.overtime',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.overtime'), href: '/hr/overtime' },
      ],
    };
  }

  if (pathname.startsWith('/hr/overtime/')) {
    return {
      titleKey: 'pages.hr.overtime.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.overtime'), href: '/hr/overtime' },
        { label: t('pages.hr.overtime.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/')) {
    const titleKey = PAGE_TITLE_KEYS[pathname] ?? 'nav.groups.humanResources';
    return {
      titleKey,
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t(titleKey) },
      ],
    };
  }

  const titleKey = PAGE_TITLE_KEYS[pathname] ?? 'nav.dashboard';

  if (pathname === '/') {
    return {
      titleKey,
      breadcrumbs: [{ label: t(titleKey) }],
    };
  }

  return {
    titleKey,
    breadcrumbs: [
      { label: t('nav.dashboard'), href: '/' },
      { label: t(titleKey) },
    ],
  };
}

/** @deprecated Import `getNavIcon` from `@/lib/navigation/nav-icons` instead. */
export type NavIconRenderer = (iconKey: string) => ReactNode;
