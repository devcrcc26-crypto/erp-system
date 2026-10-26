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

export interface HrDashboardTrendRow {
  month: string;
  total: number;
  approved: number;
  rejected: number;
}

export interface HrDashboardModuleRow {
  module: string;
  pending: number;
}

export interface HrDashboardDepartmentRow {
  department: string;
  count: number;
}

/** Role-adapted operational stats from GET /dashboard/stats. */
export interface DashboardOperationalStats {
  visibility: {
    headcount: boolean;
    attendance: boolean;
    contracts: boolean;
    siteAssignments: boolean;
    perDiem: boolean;
    overtime: boolean;
    leave: boolean;
    personal: boolean;
  };
  headcount: {
    total: number;
    onLeaveToday: number;
    newThisMonth: number;
  } | null;
  attendance: {
    month: string;
    importStatus: 'not_imported' | 'imported';
    approvalStatus: 'not_started' | 'in_progress' | 'approved';
    submittedCount: number;
    approvedCount: number;
    totalEmployees: number;
  } | null;
  overtime: {
    totalHours: number;
    pendingApprovalCount: number;
    approvedCount: number;
    employeesWithOT: number;
  };
  leave: {
    pendingApprovalCount: number;
    currentlyOnLeave: number;
    thisMonthRequests: number;
  };
  contractsExpiring: {
    within30: number;
    within60: number;
    within90: number;
    expiredUnrenewed: number;
  } | null;
  siteAssignments: {
    currentlyAssigned: number;
    expiringIn7Days: number;
    expiringIn30Days: number;
  } | null;
  perDiem: {
    pendingSettlement: number;
    pendingApproval: number;
  } | null;
  myPendingApprovals: {
    total: number;
    byType: Array<{ type: string; count: number }>;
  };
  personal: {
    myOtHoursThisMonth: number;
    myLeaveBalanceDays: number | null;
    myPendingRequestCount: number;
    upcomingSiteAssignment: {
      siteName: string;
      startDate: string;
      endDate: string;
    } | null;
  } | null;
  /** Direct-report rollup; null unless the caller has direct reports. */
  myTeam: {
    totalDirectReports: number;
    onLeaveToday: number;
    pendingMyApproval: number;
    totalOTHoursThisMonth: number;
    otByEmployee: Array<{ employeeId: string; name: string; hours: number }>;
    currentlyOnLeave: number;
    siteCurrentlyAssigned: number;
    siteExpiringSoon: number;
  } | null;
  /** Top 10 employees by OT hours this month (HR only). */
  overtimeByEmployee: Array<{
    employeeId: string;
    name: string;
    normal: number;
    evening: number;
    sunday: number;
    holiday: number;
    total: number;
  }> | null;
  /** This month's leave requests grouped by leave type (HR only). */
  leaveByType: Array<{ type: string; count: number }> | null;
  /** Current month payroll run summary (HR only; null when no run). */
  payroll: {
    status: string;
    totalEmployees: number;
    flaggedCount: number;
  } | null;
  /** Self-scoped summary, present for every role. */
  myWork: {
    leaveBalanceDays: number | null;
    otHoursThisMonth: number;
    pendingRequestsCount: number;
    nextSiteAssignment: {
      location: string;
      startDate: string;
      endDate: string;
    } | null;
  };
  /** Five soonest-ending active contracts (HR only). */
  contractsExpiringSoonList: Array<{
    employeeId: string;
    employeeName: string;
    endDate: string;
    endsToday: boolean;
  }> | null;
  /** Open approval requests company-wide (HR only). */
  pendingApprovalsCompanyWide: number | null;
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
  contractsExpiringSoon: number;
  employeesWithoutPolicy: number;
  leaveByType: Record<string, number>;
  leaveRequestsTrend: HrDashboardTrendRow[];
  pendingByModule: HrDashboardModuleRow[];
  headcountByDepartment: HrDashboardDepartmentRow[];
  recentLeaveRequests: HrDashboardRecentLeaveRequest[];
  upcomingTravel: HrDashboardUpcomingTravel[];
  overtimeThisMonth: HrDashboardOvertimeRow[];
}

/** Query for GET /hr/reports - omitted dates default to 1 January → today. */
export interface HrReportParams {
  from?: string;
  to?: string;
  departmentId?: string;
}

export interface HrReportNamedCount {
  name: string;
  count: number;
}

export interface HrReportLeaveTypeRow {
  leaveType: string;
  requests: number;
  days: number;
}

export interface HrReportEmployeeLeaveRow {
  employeeId: string;
  employeeName: string;
  department: string | null;
  requests: number;
  days: number;
}

export interface HrReportEmployeeOvertimeRow {
  employeeId: string;
  employeeName: string;
  department: string | null;
  sheets: number;
  totalHours: number;
}

export interface HrReportNamedAmount {
  name: string;
  count: number;
  amount: number;
}

/** `month` is a `YYYY-MM` key. */
export interface HrReportMonthCount {
  month: string;
  count: number;
}

export interface HrReportExpiringContractRow {
  contractId: string;
  contractNumber: string;
  employeeId: string;
  employeeName: string;
  department: string | null;
  endDate: string;
  /** `YYYY-MM` of endDate, matching `contractsByMonth[].month`. */
  month: string;
}

export interface HrReportPayroll {
  runs: number;
  totalGross: number;
  /** Employee pension + income tax. */
  totalDeductions: number;
  totalNet: number;
  byDepartment: Array<{ department: string; totalNet: number }>;
  byStatus: Array<{ status: string; count: number }>;
}

export interface HrReportAttendance {
  records: number;
  totalWorkingDays: number;
  /** Percentage, 0-100. */
  averageAttendanceRate: number;
  totalAbsentDays: number;
  totalUnpaidLeaveDays: number;
  byDepartment: Array<{ department: string; attendanceRate: number }>;
}

/** Period HR report from GET /hr/reports. */
export interface HrReport {
  generatedAt: string;
  range: { from: string; to: string };
  departmentId: string | null;
  headcount: {
    activeEmployees: number;
    inactiveEmployees: number;
    newHiresInRange: number;
    byDepartment: HrReportNamedCount[];
    /** Unset values come back as `NOT_SPECIFIED`. */
    byEmployeeType: HrReportNamedCount[];
    byNationality: HrReportNamedCount[];
    byGender: HrReportNamedCount[];
    withoutDepartment: number;
    withoutLeavePolicy: number;
  };
  /** Six months ending with the report's end month. */
  headcountTrend: HrReportMonthCount[];
  /** Next three calendar months from today. */
  contractsByMonth: HrReportMonthCount[];
  expiringContracts: HrReportExpiringContractRow[];
  payroll: HrReportPayroll;
  attendance: HrReportAttendance;
  leave: {
    requests: number;
    approvedRequests: number;
    approvedDays: number;
    byType: HrReportLeaveTypeRow[];
    byStatus: Record<string, number>;
    topEmployees: HrReportEmployeeLeaveRow[];
  };
  overtime: {
    sheets: number;
    approvedSheets: number;
    approvedHours: number;
    regularHours: number;
    nightHours: number;
    weekendHours: number;
    holidayHours: number;
    /** Approved OT on site-assignment days. */
    siteAssignmentHours: number;
    /** Subtotal: site-day OT inside scheduled hours. */
    siteWithinScheduleHours: number;
    /** Approved OT outside that subtotal. */
    otherHours: number;
    byStatus: Record<string, number>;
    topEmployees: HrReportEmployeeOvertimeRow[];
  };
  travel: {
    flights: number;
    businessTrips: number;
  };
  contracts: {
    active: number;
    expiringInRange: number;
    endedInRange: number;
  };
  siteAssignments: {
    requests: number;
    approvedRequests: number;
    byStatus: Record<string, number>;
  };
  workFromHome: {
    days: number;
  };
  expenses: {
    claims: number;
    approvedClaims: number;
    approvedAmountEtb: number;
    byStatus: Record<string, number>;
    byCategory: HrReportNamedAmount[];
  };
  evaluations: {
    total: number;
    completed: number;
    averageFinalScore: number | null;
    byStatus: Record<string, number>;
  };
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
