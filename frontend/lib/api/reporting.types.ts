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
