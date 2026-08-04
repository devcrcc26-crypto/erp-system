/** Company-wide PM aggregates from GET /dashboard/portfolio. */
export interface PortfolioDashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalUsers: number;
  openIssues: number;
  openRfis: number;
  overdueRfis: number;
  openRisks: number;
  criticalRisks: number;
  openPunchItems: number;
  overduePunchItems: number;
  overdueIssues: number;
  pendingReviews: number;
  activeCrs: number;
  activeERs: number;
  upcomingMeetings: number;
  openActionItems: number;
  pendingDailyLogs: number;
  issuesByStatus: Record<string, number>;
  rfisByStatus: Record<string, number>;
  risksByStatus: Record<string, number>;
  punchByStatus: Record<string, number>;
  projectsByStatus: Record<string, number>;
}

/** Activity row from GET /dashboard/my. */
export interface MyDashboardActivityItem {
  type: string;
  title: string;
  date: string;
  link: string;
}

/** FK-scoped personal dashboard from GET /dashboard/my. */
export interface MyDashboardStats {
  mySubtasks: number;
  myActiveReviews: number;
  myOpenIssues: number;
  myOpenRfis: number;
  myOpenActionItems: number;
  myPendingDailyLogs: number;
  myRisks: number;
  recentActivity: MyDashboardActivityItem[];
}

export interface HrDashboardRecentLeaveRequest {
  id: string;
  requestNumber: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
}

export interface HrDashboardUpcomingTravel {
  id: string;
  type: 'FLIGHT' | 'BUSINESS_TRIP';
  number: string;
  destination: string;
  departureDate: string;
  passengerCount: number;
}

export interface HrDashboardOvertimeRow {
  employeeName: string;
  totalHours: number;
}

/** HR aggregates from GET /dashboard/hr. */
export interface HrDashboardStats {
  totalEmployees: number;
  onLeaveThisWeek: number;
  pendingLeaveRequests: number;
  pendingOvertimeSheets: number;
  pendingFlightBookings: number;
  pendingBusinessTripBookings: number;
  approvedFlightsThisMonth: number;
  overtimeSubmissionsThisMonth: number;
  leaveByType: Record<string, number>;
  recentLeaveRequests: HrDashboardRecentLeaveRequest[];
  upcomingTravel: HrDashboardUpcomingTravel[];
  overtimeThisMonth: HrDashboardOvertimeRow[];
}

/** Company-wide portfolio summary from GET /reports/portfolio-summary. */
export interface PortfolioSummary {
  generatedAt: string;
  companyName: string;
  baseCurrency: string;
  completionRate: number;
  projects: {
    total: number;
    notStarted: number;
    inProgress: number;
    onHold: number;
    cancelled: number;
    completed: number;
    /** @deprecated Use inProgress */
    active: number;
    averageProgressPct: number | null;
    totalBudget: string | null;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  users: {
    total: number;
    active: number;
    inactive: number;
  };
  organization: {
    branches: number;
    departments: number;
  };
  audit: {
    last30Days: number;
    total: number;
    topModules: readonly { module: string; count: number }[];
  };
  siteOps: {
    openRfis: number;
    overdueRfis: number;
    openIssues: number;
    openPunchItems: number;
    totalOpen: number;
  };
}

export interface SystemReportPdfLabels {
  title: string;
  subtitle: string;
  preparedBy: string;
  generatedAt: string;
  executiveSummary: string;
  portfolio: string;
  organization: string;
  siteOps: string;
  audit: string;
  auditModules: string;
  projectRegister: string;
  byStatus: string;
  byType: string;
  metric: string;
  value: string;
  status: string;
  count: string;
  share: string;
  module: string;
  code: string;
  name: string;
  type: string;
  progress: string;
  budget: string;
  plannedFinish: string;
  footer: string;
  completionRate: string;
  averageProgress: string;
  portfolioBudget: string;
  activeProjects: string;
  totalOpenSiteOps: string;
  auditLast30Days: string;
  auditTotal: string;
  branches: string;
  departments: string;
  usersTotal: string;
  usersActive: string;
  usersInactive: string;
  openRfis: string;
  overdueRfis: string;
  openIssues: string;
  openPunchItems: string;
}

export interface ProjectReportPdfLabels {
  title: string;
  subtitle: string;
  preparedBy: string;
  generatedAt: string;
  projectOverview: string;
  projectCode: string;
  projectName: string;
  status: string;
  plannedFinish: string;
  budget: string;
  overallProgress: string;
  siteOps: string;
  siteOpsBreakdown: string;
  schedule: string;
  engineering: string;
  moduleSummary: string;
  tasksByStatus: string;
  packagesByStatus: string;
  disciplinesByStatus: string;
  metric: string;
  value: string;
  count: string;
  share: string;
  module: string;
  snapshot: string;
  footer: string;
  openRfis: string;
  overdueRfis: string;
  openIssues: string;
  openPunch: string;
  plannedProgress: string;
  actualProgress: string;
  scheduleVariance: string;
  taskCount: string;
  criticalTasks: string;
  activeReviews: string;
  slaOverdue: string;
  openComments: string;
  pendingSubmittals: string;
}

export interface ProjectReportPdfBreakdownRow {
  label: string;
  count: number;
}

export interface ProjectReportPdfModuleRow {
  module: string;
  snapshot: string;
}
