import { resolveProjectBreadcrumb } from '@/lib/navigation/project-workspace-nav';

export interface BreadcrumbSegment {
  readonly label: string;
  readonly href?: string;
}

export interface RouteMeta {
  readonly titleKey: string;
  /** Optional resolved page title (for dynamic routes with interpolated labels). */
  readonly title?: string;
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
  '/approvals': 'pages.approvals.listTitle',
  '/users': 'nav.users',
  '/users/new': 'nav.users',
  '/teams': 'nav.teams',
  '/reports': 'nav.reports',
  '/messages': 'nav.messages',
  '/settings': 'nav.settings',
  '/profile': 'nav.profile',
  '/profile/evaluations': 'profile.tabEvaluations',
  '/notifications': 'nav.notifications',
  '/audit-logs': 'nav.auditLogs',
  '/departments': 'pages.departments.title',
  '/positions': 'pages.positions.title',
  '/seniority-levels': 'pages.seniorityLevels.title',
  '/disciplines': 'pages.disciplinesCatalog.title',
  '/hr/leave-requests': 'nav.hr.leaveRequests',
  '/hr/leave-history/me': 'pages.hr.leaveHistory.myTitle',
  '/hr/overtime-history/me': 'pages.hr.overtimeHistory.myTitle',
  '/hr/overtime': 'nav.hr.overtime',
  '/hr/payroll': 'nav.hr.payroll',
  '/hr/expense-claims': 'nav.hr.expenseClaims',
  '/hr/purchase-requests': 'nav.hr.purchaseRequests',
  '/hr/material-requisition': 'nav.hr.materialRequisition',
  '/hr/consumables': 'nav.hr.consumables',
  '/hr/flight-applications': 'nav.hr.flightApplications',
  '/hr/vehicle-applications': 'nav.hr.vehicleApplications',
  '/hr/official-seal': 'pages.hr.officialSeal.listTitle',
  '/hr/project-seal': 'pages.hr.projectSeal.listTitle',
  '/hr/official-seal-requests': 'nav.hr.officialSealRequests',
  '/hr/vehicle-refueling': 'nav.hr.vehicleRefueling',
  '/hr/employee-contract': 'nav.hr.employeeContract',
  '/hr/employee-contract/new': 'nav.hr.employeeContract',
  '/organization/vehicles': 'nav.organization.vehicles',
  '/organization/vehicles/new': 'nav.organization.vehicles',
  '/hr/inspection-repair': 'pages.hr.inspectionRepair.listTitle',
  '/hr/business-trips': 'nav.hr.businessTrips',
  '/hr/reports': 'nav.hr.reports',
  '/hr/per-diem': 'nav.hr.perDiem',
  '/hr/employee-per-diem-rates': 'pages.hr.employeePerDiemRates.listTitle',
  '/hr/employee-per-diem-rates/new': 'pages.hr.employeePerDiemRates.listTitle',
  '/hr/leave-policy': 'pages.hr.leavePolicy.listTitle',
  '/hr/leave-policy/new': 'pages.hr.leavePolicy.listTitle',
  '/hr/policy-settings': 'pages.hr.policySettings.title',
  '/hr/org-gaps': 'pages.hr.orgGaps.title',
  '/hr/work-schedules': 'pages.hr.workSchedules.listTitle',
  '/hr/work-schedules/new': 'pages.hr.workSchedules.listTitle',
  '/hr/public-holidays': 'pages.hr.publicHolidays.listTitle',
  '/hr/public-holidays/new': 'pages.hr.publicHolidays.listTitle',
  '/hr/work-from-home': 'pages.hr.workFromHome.title',
  '/hr/site-assignments': 'nav.hr.siteAssignments',
  '/hr/company-asset': 'nav.hr.companyAssets',
  '/hr/company-asset/new': 'nav.hr.companyAssets',
  '/hr/attendance': 'nav.hr.attendance',
  '/hr/field-movement-logs': 'nav.hr.fieldMovementLogs',
  '/hr/employee-evaluation': 'nav.hr.employeeEvaluation',
  '/hr/evaluations': 'nav.hr.evaluations',
  '/hr/evaluations/cycles': 'nav.hr.evaluationCycles',
  '/hr/evaluations/templates': 'nav.hr.evaluationTemplates',
  '/hr/evaluations/inbox': 'nav.hr.evaluationInbox',
  '/hr/equipment-and-materials-exit-permit': 'pages.hr.exitPermit.listTitle',
  '/hr/equipment-and-materials-exit-permit/new': 'pages.hr.exitPermit.listTitle',
};

/**
 * `/approvals/new/...` create forms.
 * Shell header uses listTitleKey + listDescriptionKey (same as the module list).
 * formTitleKey is the in-page banner title and the last breadcrumb.
 */
const APPROVAL_NEW_ROUTE_META: Record<
  string,
  {
    formTitleKey: string;
    listHref: string;
    listTitleKey: string;
    listDescriptionKey: string;
  }
> = {
  '/approvals/new/overtime': {
    formTitleKey: 'pages.hr.overtime.new',
    listHref: '/hr/overtime',
    listTitleKey: 'nav.hr.overtime',
    listDescriptionKey: 'pages.hr.overtime.listDescription',
  },
  '/approvals/new/flight-application': {
    formTitleKey: 'pages.hr.flight.new',
    listHref: '/hr/flight-applications',
    listTitleKey: 'nav.hr.flightApplications',
    listDescriptionKey: 'pages.hr.flight.listDescription',
  },
  '/approvals/new/business-trip': {
    formTitleKey: 'pages.hr.businessTrip.new',
    listHref: '/hr/business-trips',
    listTitleKey: 'nav.hr.businessTrips',
    listDescriptionKey: 'pages.hr.businessTrip.listDescription',
  },
  '/approvals/new/expense-claim': {
    formTitleKey: 'pages.hr.expenseClaim.new',
    listHref: '/hr/expense-claims',
    listTitleKey: 'nav.hr.expenseClaims',
    listDescriptionKey: 'pages.hr.expenseClaim.listDescription',
  },
  '/approvals/new/per-diem': {
    formTitleKey: 'pages.hr.perDiem.new',
    listHref: '/hr/per-diem',
    listTitleKey: 'nav.hr.perDiem',
    listDescriptionKey: 'pages.hr.perDiem.listDescription',
  },
  '/approvals/new/per-diem-settlement': {
    formTitleKey: 'pages.hr.perDiemSettlement.new',
    listHref: '/hr/per-diem',
    listTitleKey: 'nav.hr.perDiem',
    listDescriptionKey: 'pages.hr.perDiem.listDescription',
  },
  '/approvals/new/purchase-request': {
    formTitleKey: 'pages.hr.purchaseRequest.new',
    listHref: '/hr/purchase-requests',
    listTitleKey: 'nav.hr.purchaseRequests',
    listDescriptionKey: 'pages.hr.purchaseRequest.listDescription',
  },
  '/approvals/new/material-requisition': {
    formTitleKey: 'pages.hr.materialRequisition.new',
    listHref: '/hr/material-requisition',
    listTitleKey: 'nav.hr.materialRequisition',
    listDescriptionKey: 'pages.hr.materialRequisition.listDescription',
  },
  '/approvals/new/equipment-and-materials-exit-permit': {
    formTitleKey: 'pages.hr.exitPermit.new',
    listHref: '/hr/equipment-and-materials-exit-permit',
    listTitleKey: 'pages.hr.exitPermit.listTitle',
    listDescriptionKey: 'pages.hr.exitPermit.listDescription',
  },
  '/approvals/new/exit-permit': {
    formTitleKey: 'pages.hr.exitPermit.new',
    listHref: '/hr/equipment-and-materials-exit-permit',
    listTitleKey: 'pages.hr.exitPermit.listTitle',
    listDescriptionKey: 'pages.hr.exitPermit.listDescription',
  },
  '/approvals/new/consumables': {
    formTitleKey: 'pages.hr.consumables.new',
    listHref: '/hr/consumables',
    listTitleKey: 'nav.hr.consumables',
    listDescriptionKey: 'pages.hr.consumables.listDescription',
  },
  '/approvals/new/vehicle-application': {
    formTitleKey: 'pages.hr.vehicleApplication.new',
    listHref: '/hr/vehicle-applications',
    listTitleKey: 'nav.hr.vehicleApplications',
    listDescriptionKey: 'pages.hr.vehicleApplication.listDescription',
  },
  '/approvals/new/vehicle-refueling': {
    formTitleKey: 'pages.hr.vehicleRefueling.new',
    listHref: '/hr/vehicle-refueling',
    listTitleKey: 'nav.hr.vehicleRefueling',
    listDescriptionKey: 'pages.hr.vehicleRefueling.listDescription',
  },
  '/approvals/new/inspection-repair': {
    formTitleKey: 'pages.hr.inspectionRepair.new',
    listHref: '/hr/inspection-repair',
    listTitleKey: 'pages.hr.inspectionRepair.listTitle',
    listDescriptionKey: 'pages.hr.inspectionRepair.listDescription',
  },
  '/approvals/new/official-seal': {
    formTitleKey: 'pages.hr.officialSeal.new',
    listHref: '/hr/official-seal',
    listTitleKey: 'pages.hr.officialSeal.listTitle',
    listDescriptionKey: 'pages.hr.officialSeal.listDescription',
  },
  '/approvals/new/project-seal': {
    formTitleKey: 'pages.hr.projectSeal.new',
    listHref: '/hr/project-seal',
    listTitleKey: 'pages.hr.projectSeal.listTitle',
    listDescriptionKey: 'pages.hr.projectSeal.listDescription',
  },
  '/approvals/new/field-movement-log': {
    formTitleKey: 'pages.approvals.categories.FIELD_MOVEMENT_LOG.name',
    listHref: '/hr/field-movement-logs',
    listTitleKey: 'pages.hr.fieldMovementLogs.listTitle',
    listDescriptionKey: 'pages.hr.fieldMovementLogs.listDescription',
  },
  '/approvals/new/site-assignment': {
    formTitleKey: 'pages.hr.siteAssignments.form.title',
    listHref: '/hr/site-assignments',
    listTitleKey: 'nav.hr.siteAssignments',
    listDescriptionKey: 'pages.hr.siteAssignments.description',
  },
  '/approvals/new/work-from-home': {
    formTitleKey: 'pages.hr.workFromHome.request.title',
    listHref: '/hr/work-from-home',
    listTitleKey: 'pages.hr.workFromHome.title',
    listDescriptionKey: 'pages.hr.workFromHome.description',
  },
  '/approvals/new/leave-request': {
    formTitleKey: 'pages.hr.leave.new',
    listHref: '/hr/leave-requests',
    listTitleKey: 'nav.hr.leaveRequests',
    listDescriptionKey: 'pages.hr.leave.listDescription',
  },
};

/** Route → page subtitle (description) i18n keys for MainContentHeader. */
const PAGE_DESCRIPTION_KEYS: Record<string, string> = {
  '/announcements': 'announcements.pages.listDescription',
  '/whats-new': 'announcements.pages.whatsNewDescription',
  '/hr/announcements': 'announcements.pages.manageDescription',
  '/approvals': 'pages.approvals.listDescription',
  '/approvals/new': 'pages.approvals.newDescription',
  '/users': 'users.listDescription',
  '/users/new': 'users.listDescription',
  '/departments': 'pages.departments.description',
  '/positions': 'pages.positions.description',
  '/seniority-levels': 'pages.seniorityLevels.description',
  '/disciplines': 'pages.disciplinesCatalog.description',
  '/hr/leave-requests': 'pages.hr.leave.listDescription',
  '/hr/leave-history/me': 'pages.hr.leaveHistory.myDescription',
  '/hr/overtime-history/me': 'pages.hr.overtimeHistory.myDescription',
  '/hr/overtime': 'pages.hr.overtime.listDescription',
  '/hr/payroll': 'pages.hr.payroll.listDescription',
  '/hr/attendance': 'pages.hr.attendance.listDescription',
  '/hr/field-movement-logs': 'pages.hr.fieldMovementLogs.listDescription',
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
  '/hr/employee-contract/new': 'pages.hr.employeeContract.listDescription',
  '/hr/inspection-repair': 'pages.hr.inspectionRepair.listDescription',
  '/hr/equipment-and-materials-exit-permit': 'pages.hr.exitPermit.listDescription',
  '/hr/business-trips': 'pages.hr.businessTrip.listDescription',
  '/hr/per-diem': 'pages.hr.perDiem.listDescription',
  '/hr/employee-per-diem-rates': 'pages.hr.employeePerDiemRates.listDescription',
  '/hr/employee-per-diem-rates/new': 'pages.hr.employeePerDiemRates.listDescription',
  '/hr/leave-policy': 'pages.hr.leavePolicy.listDescription',
  '/hr/leave-policy/new': 'pages.hr.leavePolicy.listDescription',
  '/hr/policy-settings': 'pages.hr.policySettings.description',
  '/hr/org-gaps': 'pages.hr.orgGaps.description',
  '/hr/work-schedules': 'pages.hr.workSchedules.listDescription',
  '/hr/work-schedules/new': 'pages.hr.workSchedules.listDescription',
  '/hr/public-holidays': 'pages.hr.publicHolidays.listDescription',
  '/hr/public-holidays/new': 'pages.hr.publicHolidays.listDescription',
  '/hr/work-from-home': 'pages.hr.workFromHome.description',
  '/hr/site-assignments': 'pages.hr.siteAssignments.description',
  '/hr/company-asset': 'pages.hr.companyAsset.listDescription',
  '/hr/company-asset/new': 'pages.hr.companyAsset.listDescription',
  '/audit-logs': 'auditLogs.description',
  '/settings': 'settings.description',
  '/organization/vehicles': 'vehicles.listDescription',
  '/organization/vehicles/new': 'vehicles.listDescription',
};

function descriptionKeyFor(pathname: string): string | undefined {
  return PAGE_DESCRIPTION_KEYS[pathname];
}

const PROJECT_ID_PATTERN = /^\/projects\/([^/]+)/;

/**
 * Extracts project id from a pathname when on a project route.
 */
export function extractProjectId(pathname: string): string | null {
  const match = PROJECT_ID_PATTERN.exec(pathname);
  return match?.[1] ?? null;
}

/**
 * Route-driven page title key, optional subtitle key, and breadcrumb segments.
 */
export function resolveRouteMeta(
  pathname: string,
  projectName: string | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
): RouteMeta {
  if (pathname === '/help' || pathname.startsWith('/help/')) {
    return {
      titleKey: 'nav.userGuide',
      breadcrumbs: [{ label: t('nav.dashboard'), href: '/' }, { label: t('nav.userGuide') }],
    };
  }
  const meta = resolveRouteMetaCore(pathname, projectName, t);
  return {
    ...meta,
    descriptionKey: meta.descriptionKey ?? descriptionKeyFor(pathname),
  };
}

/** Employee announcements, What's new, and the HR management pages. */
function resolveAnnouncementsMeta(
  pathname: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): RouteMeta | null {
  const home = { label: t('nav.dashboard'), href: '/' };
  if (pathname === '/announcements') {
    return { titleKey: 'announcements.pages.list', breadcrumbs: [home, { label: t('announcements.pages.list') }] };
  }
  if (pathname === '/whats-new') {
    return { titleKey: 'announcements.pages.whatsNew', breadcrumbs: [home, { label: t('announcements.pages.whatsNew') }] };
  }
  if (pathname.startsWith('/announcements/')) {
    return {
      titleKey: 'announcements.pages.detail',
      breadcrumbs: [
        home,
        { label: t('announcements.pages.list'), href: '/announcements' },
        { label: t('announcements.pages.detail') },
      ],
    };
  }
  if (!pathname.startsWith('/hr/announcements')) {
    return null;
  }
  const manage = { label: t('announcements.pages.manage'), href: '/hr/announcements' };
  if (pathname === '/hr/announcements') {
    return { titleKey: 'announcements.pages.manage', breadcrumbs: [home, { label: manage.label }] };
  }
  if (pathname === '/hr/announcements/new') {
    return {
      titleKey: 'announcements.pages.manage',
      descriptionKey: 'announcements.pages.manageDescription',
      breadcrumbs: [home, manage, { label: t('announcements.pages.new') }],
    };
  }
  if (pathname.endsWith('/edit')) {
    return {
      titleKey: 'announcements.pages.manage',
      descriptionKey: 'announcements.pages.manageDescription',
      breadcrumbs: [home, manage, { label: t('announcements.pages.edit') }],
    };
  }
  return {
    titleKey: 'announcements.pages.manageDetail',
    breadcrumbs: [home, manage, { label: t('announcements.pages.manageDetail') }],
  };
}

function resolveRouteMetaCore(
  pathname: string,
  projectName: string | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
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

  const announcementsMeta = resolveAnnouncementsMeta(pathname, t);
  if (announcementsMeta) {
    return announcementsMeta;
  }

  const approvalNewMeta = APPROVAL_NEW_ROUTE_META[pathname];
  if (approvalNewMeta) {
    return {
      titleKey: approvalNewMeta.listTitleKey,
      descriptionKey: approvalNewMeta.listDescriptionKey,
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t(approvalNewMeta.listTitleKey),
          href: approvalNewMeta.listHref,
        },
        { label: t(approvalNewMeta.formTitleKey) },
      ],
    };
  }

  if (pathname === '/approvals') {
    return {
      titleKey: 'pages.approvals.listTitle',
      descriptionKey: 'pages.approvals.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('pages.approvals.listTitle') },
      ],
    };
  }

  if (pathname === '/approvals/new') {
    return {
      titleKey: 'pages.approvals.new',
      descriptionKey: 'pages.approvals.newDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.approvals.listTitle'),
          href: '/approvals',
        },
        { label: t('pages.approvals.new') },
      ],
    };
  }

  if (pathname.startsWith('/approvals/')) {
    return {
      titleKey: 'pages.approvals.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.approvals.listTitle'),
          href: '/approvals',
        },
        { label: t('pages.approvals.detail') },
      ],
    };
  }

  if (pathname === '/hr/work-schedules') {
    return {
      titleKey: 'pages.hr.workSchedules.listTitle',
      descriptionKey: 'pages.hr.workSchedules.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.workSchedules.listTitle') },
      ],
    };
  }

  if (pathname === '/hr/attendance') {
    return {
      titleKey: 'pages.hr.attendance.listTitle',
      descriptionKey: 'pages.hr.attendance.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.attendance.listTitle') },
      ],
    };
  }

  if (pathname === '/hr/work-from-home') {
    return {
      titleKey: 'pages.hr.workFromHome.title',
      descriptionKey: 'pages.hr.workFromHome.description',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.workFromHome.title') },
      ],
    };
  }

  if (pathname === '/hr/site-assignments') {
    return {
      titleKey: 'nav.hr.siteAssignments',
      descriptionKey: 'pages.hr.siteAssignments.description',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('nav.hr.siteAssignments') },
      ],
    };
  }

  if (pathname.startsWith('/hr/site-assignments/')) {
    return {
      titleKey: 'nav.hr.siteAssignments',
      descriptionKey: 'pages.hr.siteAssignments.description',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        {
          label: t('nav.hr.siteAssignments'),
          href: '/hr/site-assignments',
        },
        { label: t('pages.hr.siteAssignments.detail.details') },
      ],
    };
  }

  const attendanceReviewMatch = pathname.match(
    /^\/hr\/attendance\/review\/(\d{1,2})\/(\d{4})$/,
  );
  if (attendanceReviewMatch) {
    const month = Number(attendanceReviewMatch[1]);
    const year = attendanceReviewMatch[2];
    const monthName = t(`hr.months.${month}`);
    const reviewLabel = t('pages.hr.attendance.review.breadcrumb', {
      month: monthName,
      year,
    });
    return {
      titleKey: 'pages.hr.attendance.review.title',
      title: reviewLabel,
      descriptionKey: 'pages.hr.attendance.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        {
          label: t('pages.hr.attendance.listTitle'),
          href: '/hr/attendance',
        },
        { label: reviewLabel },
      ],
    };
  }

  if (pathname === '/hr/field-movement-logs') {
    return {
      titleKey: 'pages.hr.fieldMovementLogs.listTitle',
      descriptionKey: 'pages.hr.fieldMovementLogs.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.fieldMovementLogs.listTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/field-movement-logs/')) {
    return {
      titleKey: 'pages.hr.fieldMovementLogs.detail',
      descriptionKey: 'pages.hr.fieldMovementLogs.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        {
          label: t('pages.hr.fieldMovementLogs.listTitle'),
          href: '/hr/field-movement-logs',
        },
        { label: t('pages.hr.fieldMovementLogs.detail') },
      ],
    };
  }

  if (pathname === '/hr/work-schedules/new') {
    return {
      titleKey: 'pages.hr.workSchedules.listTitle',
      descriptionKey: 'pages.hr.workSchedules.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        {
          label: t('pages.hr.workSchedules.listTitle'),
          href: '/hr/work-schedules',
        },
        { label: t('pages.hr.workSchedules.new') },
      ],
    };
  }

  if (pathname.match(/^\/hr\/work-schedules\/[^/]+\/edit$/)) {
    const id = pathname.split('/')[3];
    return {
      titleKey: 'pages.hr.workSchedules.listTitle',
      descriptionKey: 'pages.hr.workSchedules.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        {
          label: t('pages.hr.workSchedules.listTitle'),
          href: '/hr/work-schedules',
        },
        {
          label: t('pages.hr.workSchedules.detail'),
          href: id ? `/hr/work-schedules/${id}` : undefined,
        },
        { label: t('pages.hr.workSchedules.edit') },
      ],
    };
  }

  if (pathname.match(/^\/hr\/work-schedules\/[^/]+$/)) {
    return {
      titleKey: 'pages.hr.workSchedules.listTitle',
      descriptionKey: 'pages.hr.workSchedules.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        {
          label: t('pages.hr.workSchedules.listTitle'),
          href: '/hr/work-schedules',
        },
        { label: t('pages.hr.workSchedules.detail') },
      ],
    };
  }

  if (pathname === '/hr/public-holidays') {
    return {
      titleKey: 'pages.hr.publicHolidays.listTitle',
      descriptionKey: 'pages.hr.publicHolidays.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.publicHolidays.listTitle') },
      ],
    };
  }

  if (pathname === '/hr/public-holidays/new') {
    return {
      titleKey: 'pages.hr.publicHolidays.listTitle',
      descriptionKey: 'pages.hr.publicHolidays.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.publicHolidays.listTitle'),
          href: '/hr/public-holidays',
        },
        { label: t('pages.hr.publicHolidays.new') },
      ],
    };
  }

  if (pathname.match(/^\/hr\/public-holidays\/[^/]+\/edit$/)) {
    const id = pathname.split('/')[3];
    return {
      titleKey: 'pages.hr.publicHolidays.listTitle',
      descriptionKey: 'pages.hr.publicHolidays.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.publicHolidays.listTitle'),
          href: '/hr/public-holidays',
        },
        {
          label: t('pages.hr.publicHolidays.detail'),
          href: id ? `/hr/public-holidays/${id}` : undefined,
        },
        { label: t('pages.hr.publicHolidays.edit') },
      ],
    };
  }

  if (pathname.match(/^\/hr\/public-holidays\/[^/]+$/)) {
    return {
      titleKey: 'pages.hr.publicHolidays.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.publicHolidays.listTitle'),
          href: '/hr/public-holidays',
        },
        { label: t('pages.hr.publicHolidays.detail') },
      ],
    };
  }

  if (pathname === '/hr/policy-settings') {
    return {
      titleKey: 'pages.hr.policySettings.title',
      descriptionKey: 'pages.hr.policySettings.description',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.policySettings.title') },
      ],
    };
  }

  if (pathname === '/hr/leave-policy') {
    return {
      titleKey: 'pages.hr.leavePolicy.listTitle',
      descriptionKey: 'pages.hr.leavePolicy.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.leavePolicy.listTitle') },
      ],
    };
  }

  if (pathname === '/hr/leave-policy/new') {
    return {
      titleKey: 'pages.hr.leavePolicy.listTitle',
      descriptionKey: 'pages.hr.leavePolicy.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.leavePolicy.listTitle'),
          href: '/hr/leave-policy',
        },
        { label: t('pages.hr.leavePolicy.new') },
      ],
    };
  }

  if (pathname.match(/^\/hr\/leave-policy\/[^/]+\/edit$/)) {
    const id = pathname.split('/')[3];
    return {
      titleKey: 'pages.hr.leavePolicy.listTitle',
      descriptionKey: 'pages.hr.leavePolicy.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.leavePolicy.listTitle'),
          href: '/hr/leave-policy',
        },
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
        {
          label: t('pages.hr.leavePolicy.listTitle'),
          href: '/hr/leave-policy',
        },
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

  if (pathname === '/hr/overtime-history/me') {
    return {
      titleKey: 'pages.hr.overtimeHistory.myTitle',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.profile'), href: '/profile' },
        { label: t('pages.hr.overtimeHistory.myTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/overtime-history/')) {
    return {
      titleKey: 'pages.hr.overtimeHistory.title',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.overtime'), href: '/hr/overtime' },
        { label: t('pages.hr.overtimeHistory.title') },
      ],
    };
  }

  if (pathname.match(/^\/hr\/leave-requests\/[^/]+\/edit$/)) {
    const id = pathname.split('/')[3];
    return {
      titleKey: 'nav.hr.leaveRequests',
      descriptionKey: 'pages.hr.leave.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.leaveRequests'), href: '/hr/leave-requests' },
        {
          label: t('pages.hr.leave.detail'),
          href: id ? `/hr/leave-requests/${id}` : undefined,
        },
        { label: t('pages.hr.leave.edit') },
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
      titleKey: 'nav.users',
      descriptionKey: 'users.listDescription',
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
      titleKey: 'nav.users',
      descriptionKey: 'users.listDescription',
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

  if (pathname.startsWith('/hr/payroll/')) {
    return {
      titleKey: 'pages.hr.payroll.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.payroll'), href: '/hr/payroll' },
        { label: t('pages.hr.payroll.detail') },
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

  if (pathname.match(/^\/hr\/expense-claims\/[^/]+\/edit$/)) {
    const id = pathname.split('/')[3];
    return {
      titleKey: 'nav.hr.expenseClaims',
      descriptionKey: 'pages.hr.expenseClaim.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.expenseClaims'), href: '/hr/expense-claims' },
        {
          label: t('pages.hr.expenseClaim.detail'),
          href: id ? `/hr/expense-claims/${id}` : undefined,
        },
        { label: t('pages.hr.expenseClaim.edit') },
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

  if (pathname === '/hr/employee-per-diem-rates/new') {
    return {
      titleKey: 'pages.hr.employeePerDiemRates.listTitle',
      descriptionKey: 'pages.hr.employeePerDiemRates.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.employeePerDiemRates.listTitle'),
          href: '/hr/employee-per-diem-rates',
        },
        { label: t('pages.hr.employeePerDiemRates.addRates') },
      ],
    };
  }

  if (pathname.match(/^\/hr\/employee-per-diem-rates\/[^/]+\/edit$/)) {
    const employeeId = pathname.split('/')[3];
    return {
      titleKey: 'pages.hr.employeePerDiemRates.listTitle',
      descriptionKey: 'pages.hr.employeePerDiemRates.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.employeePerDiemRates.listTitle'),
          href: '/hr/employee-per-diem-rates',
        },
        {
          label: t('pages.hr.employeePerDiemRates.editTitle'),
          href: employeeId
            ? `/hr/employee-per-diem-rates/${employeeId}`
            : undefined,
        },
        { label: t('pages.hr.employeePerDiemRates.editTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/employee-per-diem-rates/')) {
    return {
      titleKey: 'pages.hr.employeePerDiemRates.listTitle',
      descriptionKey: 'pages.hr.employeePerDiemRates.listDescription',
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

  if (pathname === '/hr/equipment-and-materials-exit-permit') {
    return {
      titleKey: 'pages.hr.exitPermit.listTitle',
      descriptionKey: 'pages.hr.exitPermit.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.exitPermit.listTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/equipment-and-materials-exit-permit/')) {
    return {
      titleKey: 'pages.hr.exitPermit.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.exitPermit.listTitle'),
          href: '/hr/equipment-and-materials-exit-permit',
        },
        { label: t('pages.hr.exitPermit.detail') },
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
      titleKey: 'nav.hr.employeeContract',
      descriptionKey: 'pages.hr.employeeContract.listDescription',
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
      titleKey: 'nav.hr.employeeContract',
      descriptionKey: 'pages.hr.employeeContract.listDescription',
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

  if (pathname === '/hr/inspection-repair') {
    return {
      titleKey: 'pages.hr.inspectionRepair.listTitle',
      descriptionKey: 'pages.hr.inspectionRepair.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.inspectionRepair.listTitle') },
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
        titleKey: 'nav.organization.vehicles',
        descriptionKey: 'vehicles.listDescription',
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
        titleKey: 'nav.organization.vehicles',
        descriptionKey: 'vehicles.listDescription',
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

  if (pathname.startsWith('/hr/per-diem/settlements/')) {
    return {
      titleKey: 'pages.hr.perDiemSettlement.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.perDiem'), href: '/hr/per-diem' },
        { label: t('pages.hr.perDiemSettlement.detail') },
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
  if (pathname === '/hr/official-seal') {
    return {
      titleKey: 'pages.hr.officialSeal.listTitle',
      descriptionKey: 'pages.hr.officialSeal.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.officialSeal.listTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/official-seal/')) {
    return {
      titleKey: 'pages.hr.officialSeal.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.officialSeal.listTitle'),
          href: '/hr/official-seal',
        },
        { label: t('pages.hr.officialSeal.detail') },
      ],
    };
  }

  if (pathname === '/hr/project-seal') {
    return {
      titleKey: 'pages.hr.projectSeal.listTitle',
      descriptionKey: 'pages.hr.projectSeal.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.projectSeal.listTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/project-seal/')) {
    return {
      titleKey: 'pages.hr.projectSeal.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.projectSeal.listTitle'),
          href: '/hr/project-seal',
        },
        { label: t('pages.hr.projectSeal.detail') },
      ],
    };
  }

  if (pathname === '/hr/company-asset/new') {
    return {
      titleKey: 'nav.hr.companyAssets',
      descriptionKey: 'pages.hr.companyAsset.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.companyAssets'),
          href: '/hr/company-asset',
        },
        { label: t('pages.hr.companyAsset.new') },
      ],
    };
  }

  if (pathname.startsWith('/hr/company-asset/') && pathname.endsWith('/edit')) {
    const assetId = pathname.split('/')[3];
    return {
      titleKey: 'nav.hr.companyAssets',
      descriptionKey: 'pages.hr.companyAsset.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.companyAssets'),
          href: '/hr/company-asset',
        },
        {
          label: t('pages.hr.companyAsset.detail'),
          href: assetId ? `/hr/company-asset/${assetId}` : undefined,
        },
        { label: t('pages.hr.companyAsset.edit') },
      ],
    };
  }

  if (pathname.startsWith('/hr/company-asset/')) {
    return {
      titleKey: 'pages.hr.companyAsset.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.companyAssets'),
          href: '/hr/company-asset',
        },
        { label: t('pages.hr.companyAsset.detail') },
      ],
    };
  }

  if (pathname === '/hr/company-asset') {
    return {
      titleKey: 'pages.hr.companyAsset.listTitle',
      descriptionKey: 'pages.hr.companyAsset.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.companyAsset.listTitle') },
      ],
    };
  }

  if (pathname === '/hr/evaluations/cycles') {
    return {
      titleKey: 'nav.hr.evaluationCycles',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('nav.hr.evaluations'), href: '/hr/evaluations' },
        { label: t('nav.hr.evaluationCycles') },
      ],
    };
  }

  if (pathname === '/hr/evaluations/inbox') {
    return {
      titleKey: 'nav.hr.evaluationInbox',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('nav.hr.evaluationInbox') },
      ],
    };
  }

  if (pathname === '/hr/evaluations/templates') {
    return {
      titleKey: 'nav.hr.evaluationTemplates',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('nav.hr.evaluations'), href: '/hr/evaluations' },
        { label: t('nav.hr.evaluationTemplates') },
      ],
    };
  }

  if (pathname.startsWith('/hr/evaluations/templates/')) {
    return {
      titleKey: 'nav.hr.evaluationTemplates',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('nav.hr.evaluationTemplates'), href: '/hr/evaluations/templates' },
        { label: t('nav.hr.evaluationTemplates') },
      ],
    };
  }

  if (
    pathname.startsWith('/hr/evaluations/') &&
    pathname !== '/hr/evaluations/cycles' &&
    pathname !== '/hr/evaluations/inbox' &&
    !pathname.startsWith('/hr/evaluations/templates')
  ) {
    return {
      titleKey: 'nav.hr.employeeEvaluation',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('nav.hr.evaluations'), href: '/hr/evaluations' },
        { label: t('nav.hr.employeeEvaluation') },
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
