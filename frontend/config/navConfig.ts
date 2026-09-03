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
  /** Optional i18n key for the top-bar subtitle under the page title. */
  readonly descriptionKey?: string;
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
  '/users/new': 'pages.users.new',
  '/teams': 'nav.teams',
  '/reports': 'nav.reports',
  '/messages': 'nav.messages',
  '/settings': 'nav.settings',
  '/profile': 'nav.profile',
  '/notifications': 'nav.notifications',
  '/audit-logs': 'nav.auditLogs',
  '/departments': 'pages.departments.title',
  '/positions': 'pages.positions.title',
  '/disciplines': 'pages.disciplinesCatalog.title',
  '/hr/leave-requests': 'nav.hr.leaveRequests',
  '/hr/leave-history/me': 'pages.hr.leaveHistory.myTitle',
  '/hr/overtime': 'nav.hr.overtime',
  '/hr/expense-claims': 'nav.hr.expenseClaims',
  '/hr/purchase-requests': 'nav.hr.purchaseRequests',
  '/hr/material-requisition': 'nav.hr.materialRequisition',
  '/hr/consumables': 'nav.hr.consumables',
  '/hr/flight-applications': 'nav.hr.flightApplications',
  '/hr/vehicle-applications': 'nav.hr.vehicleApplications',
  '/hr/official-seal': 'nav.hr.officialSeal',
  '/hr/project-seal': 'nav.hr.projectSeal',
  '/hr/official-seal-requests': 'nav.hr.officialSealRequests',
  '/hr/vehicle-refueling': 'nav.hr.vehicleRefueling',
  '/hr/employee-contract': 'nav.hr.employeeContract',
  '/hr/employee-contract/new': 'pages.hr.employeeContract.new',
  '/organization/vehicles': 'nav.organization.vehicles',
  '/organization/vehicles/new': 'pages.organization.vehicles.new',
  '/hr/inspection-repair': 'pages.hr.inspectionRepair.listTitle',
  '/hr/business-trips': 'nav.hr.businessTrips',
  '/hr/reports': 'nav.hr.reports',
  '/hr/per-diem': 'nav.hr.perDiem',
  '/hr/employee-per-diem-rates': 'pages.hr.employeePerDiemRates.listTitle',
  '/hr/leave-policy': 'nav.hr.leavePolicy',
  '/hr/leave-policy/new': 'pages.hr.leavePolicy.new',
  '/hr/company-asset': 'nav.hr.companyAssets',
  '/hr/company-asset/new': 'pages.hr.companyAsset.new',
  '/hr/asset-management': 'nav.hr.assetManagement',
  '/hr/attendance': 'nav.hr.attendance',
  '/hr/employee-evaluation': 'nav.hr.employeeEvaluation',
  '/hr/equipment-and-materials-exit-permit': 'nav.hr.equipmentAndMaterialsExitPermit',
};

/** Route → page subtitle (description) i18n keys for MainContentHeader. */
const PAGE_DESCRIPTION_KEYS: Record<string, string> = {
  '/approvals': 'pages.approvals.listDescription',
  '/approvals/new': 'pages.approvals.newDescription',
  '/users': 'users.listDescription',
  '/users/new': 'users.form.addEmployeeDescription',
  '/departments': 'pages.departments.description',
  '/positions': 'pages.positions.description',
  '/disciplines': 'pages.disciplinesCatalog.description',
  '/hr/leave-requests': 'pages.hr.leave.listDescription',
  '/hr/leave-history/me': 'pages.hr.leaveHistory.myDescription',
  '/hr/overtime': 'pages.hr.overtime.listDescription',
  '/hr/expense-claims': 'pages.hr.expenseClaim.listDescription',
  '/hr/purchase-requests': 'pages.hr.purchaseRequest.listDescription',
  '/hr/material-requisition': 'pages.hr.materialRequisition.listDescription',
  '/hr/consumables': 'pages.hr.consumables.listDescription',
  '/hr/flight-applications': 'pages.hr.flight.listDescription',
  '/hr/vehicle-applications': 'pages.hr.vehicleApplication.listDescription',
  '/hr/official-seal': 'pages.hr.officialSeal.listDescription',
  '/hr/project-seal': 'pages.hr.projectSeal.listDescription',
  '/hr/vehicle-refueling': 'pages.hr.vehicleRefueling.listDescription',
  '/hr/employee-contract': 'pages.hr.employeeContract.listDescription',
  '/hr/employee-contract/new': 'pages.hr.employeeContract.formDescription',
  '/hr/inspection-repair': 'pages.hr.inspectionRepair.listDescription',
  '/hr/business-trips': 'pages.hr.businessTrip.listDescription',
  '/hr/per-diem': 'pages.hr.perDiem.listDescription',
  '/hr/employee-per-diem-rates': 'pages.hr.employeePerDiemRates.listDescription',
  '/hr/leave-policy': 'hr.leavePolicy.formDescription',
  '/hr/leave-policy/new': 'hr.leavePolicy.formDescription',
  '/hr/company-asset': 'pages.hr.companyAsset.listDescription',
  '/hr/company-asset/new': 'pages.hr.companyAsset.formDescription',
  '/audit-logs': 'auditLogs.description',
  '/organization/vehicles': 'vehicles.listDescription',
  '/organization/vehicles/new': 'vehicles.form.addDescription',
  '/approvals/new/leave-request': 'pages.hr.leave.listDescription',
  '/approvals/new/expense-claim': 'pages.hr.expenseClaim.formDescription',
  '/approvals/new/purchase-request': 'pages.hr.purchaseRequest.formDescription',
  '/approvals/new/material-requisition': 'pages.hr.materialRequisition.formDescription',
  '/approvals/new/equipment-and-materials-exit-permit': 'pages.hr.exitPermit.formDescription',
  '/approvals/new/consumables': 'pages.hr.consumables.formDescription',
  '/approvals/new/per-diem': 'pages.hr.perDiem.formDescription',
  '/approvals/new/vehicle-application': 'pages.hr.vehicleApplication.formDescription',
  '/approvals/new/vehicle-refueling': 'pages.hr.vehicleRefueling.formDescription',
  '/approvals/new/inspection-repair': 'pages.hr.inspectionRepair.formDescription',
  '/approvals/new/official-seal': 'pages.hr.officialSeal.formDescription',
  '/approvals/new/project-seal': 'pages.hr.projectSeal.formDescription',
};

function descriptionKeyFor(pathname: string): string | undefined {
  return PAGE_DESCRIPTION_KEYS[pathname];
}

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
        key: '/hr/employee-contract',
        labelKey: 'nav.hr.employeeContract',
        href: '/hr/employee-contract',
        iconKey: 'hr-employee-contract',
        visible: canViewHr,
      },
      {
        key: '/hr/leave-requests',
        labelKey: 'nav.hr.leaveRequests',
        href: '/hr/leave-requests',
        iconKey: 'hr-leave',
        visible: canViewHr,
      },
      {
        key: '/hr/overtime',
        labelKey: 'nav.hr.overtime',
        href: '/hr/overtime',
        iconKey: 'hr-overtime',
        visible: canViewHr,
      },
      {
        key: '/hr/expense-claims',
        labelKey: 'nav.hr.expenseClaims',
        href: '/hr/expense-claims',
        iconKey: 'hr-expense',
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
        key: '/hr/business-trips',
        labelKey: 'nav.hr.businessTrips',
        href: '/hr/business-trips',
        iconKey: 'hr-business-trip',
        visible: canViewHr,
      },
      {
        key: '/hr/per-diem',
        labelKey: 'nav.hr.perDiem',
        href: '/hr/per-diem',
        iconKey: 'hr-per-diem',
        visible: canViewHr,
      },
      {
        key: '/hr/employee-per-diem-rates',
        labelKey: 'nav.hr.employeePerDiemRates',
        href: '/hr/employee-per-diem-rates',
        iconKey: 'hr-per-diem-rates',
        visible: canViewHr || canManageUsers,
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
        key: '/hr/vehicle-applications',
        labelKey: 'nav.hr.vehicleApplications',
        href: '/hr/vehicle-applications',
        iconKey: 'hr-vehicle',
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
        key: '/hr/company-asset',
        labelKey: 'nav.hr.companyAssets',
        href: '/hr/company-asset',
        iconKey: 'hr-company-asset',
        visible: canViewHr,
      },
      {
        key: '/hr/inspection-repair',
        labelKey: 'nav.hr.inspectionRepair',
        href: '/hr/inspection-repair',
        iconKey: 'hr-inspection',
        visible: canViewHr,
      },
      // {
      //   key: '/hr/asset-management',
      //   labelKey: 'nav.hr.assetManagement',
      //   href: '/hr/asset-management',
      //   iconKey: 'hr-asset-management',
      //   visible: canViewHr,
      // },
      {
        key: '/hr/equipment-and-materials-exit-permit',
        labelKey: 'nav.hr.equipmentAndMaterialsExitPermit',
        href: '/hr/equipment-and-materials-exit-permit',
        iconKey: 'hr-equipment-and-materials-exit-permit',
        visible: canViewHr,
      },
      {
        key: '/hr/attendance',
        labelKey: 'nav.hr.attendance',
        href: '/hr/attendance',
        iconKey: 'hr-attendance',
        visible: canViewHr,
      },
      {
        key: '/hr/employee-evaluation',
        labelKey: 'nav.hr.employeeEvaluation',
        href: '/hr/employee-evaluation',
        iconKey: 'hr-employee-evaluation',
        visible: canViewHr,
      },
      {
        key: '/hr/reports',
        labelKey: 'nav.hr.reports',
        href: '/hr/reports',
        iconKey: 'hr-reports',
        visible: canViewHr,
      }
    ],
  };

  const organization: IconRailGroup = {
    key: 'organization',
    labelKey: 'nav.groups.organization',
    storageKey: 'sidebar_organization_open',
    defaultOpen: true,
    items: [
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
        key: '/organization/vehicles',
        labelKey: 'nav.organization.vehicles',
        href: '/organization/vehicles',
        iconKey: 'hr-vehicle',
        visible: canViewHr,
      },
    ],
  };

  const hrConfiguration: IconRailGroup = {
    key: 'hr-configuration',
    labelKey: 'nav.groups.hrConfiguration',
    storageKey: 'sidebar_hr_configuration_open',
    defaultOpen: true,
    items: [
      {
        key: '/hr/leave-policy',
        labelKey: 'nav.hr.leavePolicy',
        href: '/hr/leave-policy',
        iconKey: 'hr-leave-policy',
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

  const showOrganization =
    canViewDepartments ||
    canViewPositions ||
    canViewDisciplinesCatalog ||
    canViewHr;

  const showHrConfiguration = canViewHr;

  return {
    topItems,
    groups: [
      projectManagement,
      ...(canViewHr || canManageUsers ? [humanResources] : []),
      ...(showHrConfiguration ? [hrConfiguration] : []),
      ...(showOrganization ? [organization] : []),
    ],
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
  if (pathname === '/profile' || pathname === '/hr/leave-history/me') {
    return '/profile';
  }

  if (pathname.startsWith('/hr/leave-history/')) {
    return '/hr/leave-requests';
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
 * Route-driven page title key, optional subtitle key, and breadcrumb segments.
 */
export function resolveRouteMeta(
  pathname: string,
  projectName: string | null,
  t: (key: string) => string,
): RouteMeta {
  const meta = resolveRouteMetaCore(pathname, projectName, t);
  return {
    ...meta,
    descriptionKey: meta.descriptionKey ?? descriptionKeyFor(pathname),
  };
}

function resolveRouteMetaCore(
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

  if (
    pathname === '/approvals/new/leave-request'
  ) {
    return {
      titleKey: 'pages.hr.leave.new',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.leaveRequests'), href: '/hr/leave-requests' },
        { label: t('pages.hr.leave.new') },
      ],
    };
  }

  if (
    pathname === '/approvals/new/overtime' ||
    pathname === '/approvals/new/flight-application' ||
    pathname === '/approvals/new/business-trip' ||
    pathname === '/approvals/new/expense-claim' ||
    pathname === '/approvals/new/per-diem' ||
    pathname === '/approvals/new/purchase-request' ||
    pathname === '/approvals/new/material-requisition' ||
    pathname === '/approvals/new/equipment-and-materials-exit-permit' ||
    pathname === '/approvals/new/consumables' ||
    pathname === '/approvals/new/vehicle-application' ||
    pathname === '/approvals/new/vehicle-refueling' ||
    pathname === '/approvals/new/inspection-repair' ||
    pathname === '/approvals/new/official-seal' ||
    pathname === '/approvals/new/project-seal'
  ) {
    return {
      titleKey: 'pages.approvals.new',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.approvals'), href: '/approvals' },
        { label: t('pages.approvals.new'), href: '/approvals/new' },
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

  if (pathname === '/hr/leave-policy/new') {
    return {
      titleKey: 'pages.hr.leavePolicy.new',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.leavePolicy'), href: '/hr/leave-policy' },
        { label: t('pages.hr.leavePolicy.new') },
      ],
    };
  }

  if (pathname.match(/^\/hr\/leave-policy\/[^/]+\/edit$/)) {
    const id = pathname.split('/')[3];
    return {
      titleKey: 'pages.hr.leavePolicy.edit',
      descriptionKey: 'hr.leavePolicy.formDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.leavePolicy'), href: '/hr/leave-policy' },
        {
          label: t('pages.hr.leavePolicy.detail'),
          href: id ? `/hr/leave-policy/${id}` : undefined,
        },
        { label: t('pages.hr.leavePolicy.edit') },
      ],
    };
  }

  if (pathname.match(/^\/hr\/leave-policy\/[^/]+$/)) {
    return {
      titleKey: 'pages.hr.leavePolicy.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.leavePolicy'), href: '/hr/leave-policy' },
        { label: t('pages.hr.leavePolicy.detail') },
      ],
    };
  }

  if (pathname === '/hr/leave-history/me') {
    return {
      titleKey: 'pages.hr.leaveHistory.myTitle',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.profile'), href: '/profile' },
        { label: t('pages.hr.leaveHistory.myTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/leave-history/')) {
    return {
      titleKey: 'pages.hr.leaveHistory.title',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.leaveRequests'), href: '/hr/leave-requests' },
        { label: t('pages.hr.leaveHistory.title') },
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

  if (pathname === '/users/new') {
    return {
      titleKey: 'pages.users.new',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.users'), href: '/users' },
        { label: t('pages.users.new') },
      ],
    };
  }

  const usersEditMatch = /^\/users\/([^/]+)\/edit$/.exec(pathname);
  if (usersEditMatch) {
    const userId = usersEditMatch[1];
    return {
      titleKey: 'pages.users.edit',
      descriptionKey: 'users.form.editEmployeeDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.users'), href: '/users' },
        { label: t('pages.users.detail'), href: `/users/${userId}` },
        { label: t('pages.users.edit') },
      ],
    };
  }

  const usersDetailMatch = /^\/users\/([^/]+)$/.exec(pathname);
  if (usersDetailMatch) {
    return {
      titleKey: 'pages.users.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.users'), href: '/users' },
        { label: t('pages.users.detail') },
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

  if (pathname.startsWith('/hr/flight-applications/')) {
    return {
      titleKey: 'pages.hr.flight.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.flightApplications'),
          href: '/hr/flight-applications',
        },
        { label: t('pages.hr.flight.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/business-trips/')) {
    return {
      titleKey: 'pages.hr.businessTrip.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.businessTrips'),
          href: '/hr/business-trips',
        },
        { label: t('pages.hr.businessTrip.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/expense-claims/')) {
    return {
      titleKey: 'pages.hr.expenseClaim.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.expenseClaims'), href: '/hr/expense-claims' },
        { label: t('pages.hr.expenseClaim.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/employee-per-diem-rates/')) {
    return {
      titleKey: 'pages.hr.employeePerDiemRates.listTitle',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.employeePerDiemRates'),
          href: '/hr/employee-per-diem-rates',
        },
        { label: t('pages.hr.employeePerDiemRates.listTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/purchase-requests/')) {
    return {
      titleKey: 'pages.hr.purchaseRequest.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.purchaseRequests'),
          href: '/hr/purchase-requests',
        },
        { label: t('pages.hr.purchaseRequest.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/material-requisition/')) {
    return {
      titleKey: 'pages.hr.materialRequisition.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.materialRequisition'),
          href: '/hr/material-requisition',
        },
        { label: t('pages.hr.materialRequisition.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/consumables/')) {
    return {
      titleKey: 'pages.hr.consumables.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.consumables'),
          href: '/hr/consumables',
        },
        { label: t('pages.hr.consumables.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/vehicle-applications/')) {
    return {
      titleKey: 'pages.hr.vehicleApplication.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.vehicleApplications'),
          href: '/hr/vehicle-applications',
        },
        { label: t('pages.hr.vehicleApplication.detail') },
      ],
    };
  }

  if (pathname === '/hr/employee-contract/new') {
    return {
      titleKey: 'pages.hr.employeeContract.new',
      descriptionKey: 'pages.hr.employeeContract.formDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.employeeContract'),
          href: '/hr/employee-contract',
        },
        { label: t('pages.hr.employeeContract.new') },
      ],
    };
  }

  if (pathname.startsWith('/hr/employee-contract/') && pathname.endsWith('/edit')) {
    return {
      titleKey: 'pages.hr.employeeContract.edit',
      descriptionKey: 'pages.hr.employeeContract.formDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.employeeContract'),
          href: '/hr/employee-contract',
        },
        { label: t('pages.hr.employeeContract.edit') },
      ],
    };
  }

  if (pathname.startsWith('/hr/employee-contract/')) {
    return {
      titleKey: 'pages.hr.employeeContract.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.employeeContract'),
          href: '/hr/employee-contract',
        },
        { label: t('pages.hr.employeeContract.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/vehicle-refueling/')) {
    return {
      titleKey: 'pages.hr.vehicleRefueling.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.vehicleRefueling'),
          href: '/hr/vehicle-refueling',
        },
        { label: t('pages.hr.vehicleRefueling.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/inspection-repair/')) {
    return {
      titleKey: 'pages.hr.inspectionRepair.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.inspectionRepair'),
          href: '/hr/inspection-repair',
        },
        { label: t('pages.hr.inspectionRepair.detail') },
      ],
    };
  }

  if (pathname.startsWith('/audit-logs/')) {
    return {
      titleKey: 'pages.auditLogs.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.auditLogs'), href: '/audit-logs' },
        { label: t('pages.auditLogs.detail') },
      ],
    };
  }

  if (pathname.startsWith('/organization/vehicles')) {
    if (pathname === '/organization/vehicles/new') {
      return {
        titleKey: 'pages.organization.vehicles.new',
        descriptionKey: 'vehicles.form.addDescription',
        breadcrumbs: [
          { label: t('nav.dashboard'), href: '/' },
          { label: t('nav.organization.vehicles'), href: '/organization/vehicles' },
          { label: t('pages.organization.vehicles.new') },
        ],
      };
    }

    const vehiclesEditMatch = /^\/organization\/vehicles\/([^/]+)\/edit$/.exec(
      pathname,
    );
    if (vehiclesEditMatch) {
      const vehicleId = vehiclesEditMatch[1];
      return {
        titleKey: 'pages.organization.vehicles.edit',
        descriptionKey: 'vehicles.form.editDescription',
        breadcrumbs: [
          { label: t('nav.dashboard'), href: '/' },
          { label: t('nav.organization.vehicles'), href: '/organization/vehicles' },
          {
            label: t('pages.organization.vehicles.detail'),
            href: `/organization/vehicles/${vehicleId}`,
          },
          { label: t('pages.organization.vehicles.edit') },
        ],
      };
    }

    const vehiclesDetailMatch = /^\/organization\/vehicles\/([^/]+)$/.exec(pathname);
    if (vehiclesDetailMatch) {
      return {
        titleKey: 'pages.organization.vehicles.detail',
        breadcrumbs: [
          { label: t('nav.dashboard'), href: '/' },
          { label: t('nav.organization.vehicles'), href: '/organization/vehicles' },
          { label: t('pages.organization.vehicles.detail') },
        ],
      };
    }

    return {
      titleKey: 'nav.organization.vehicles',
      descriptionKey: 'vehicles.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.organization') },
        { label: t('nav.organization.vehicles') },
      ],
    };
  }

  if (pathname.startsWith('/hr/per-diem/')) {
    return {
      titleKey: 'pages.hr.perDiem.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.perDiem'), href: '/hr/per-diem' },
        { label: t('pages.hr.perDiem.detail') },
      ],
    };
  }
  if (pathname.startsWith('/hr/official-seal/')) {
    return {
      titleKey: 'pages.hr.officialSeal.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.officialSeal'), href: '/hr/official-seal' },
        { label: t('pages.hr.officialSeal.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/project-seal/')) {
    return {
      titleKey: 'pages.hr.projectSeal.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.projectSeal'), href: '/hr/project-seal' },
        { label: t('pages.hr.projectSeal.detail') },
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
      breadcrumbs: [],
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
