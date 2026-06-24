/** Company-wide portfolio summary from GET /reports/portfolio-summary. */
export interface PortfolioSummary {
  generatedAt: string;
  completionRate: number;
  projects: {
    total: number;
    active: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  users: {
    total: number;
    active: number;
  };
  organization: {
    branches: number;
    departments: number;
  };
  audit: {
    last30Days: number;
    total: number;
  };
  siteOps: {
    openRfis: number;
    overdueRfis: number;
    openIssues: number;
    openPunchItems: number;
  };
}
