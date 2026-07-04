import type { PortfolioSummary } from '@/lib/api/reporting.types';

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const record: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === 'number' && Number.isFinite(count)) {
      record[key] = count;
    }
  }
  return record;
}

/**
 * Normalizes API or fallback payloads so older portfolio-summary responses
 * do not crash the reports UI when new fields are missing.
 */
export function normalizePortfolioSummary(
  raw: unknown,
  fallbackCompanyName = 'Company',
): PortfolioSummary | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as Partial<PortfolioSummary>;
  const byStatus = asRecord(data.projects?.byStatus);
  const byType = asRecord(data.projects?.byType);

  const openRfis = asNumber(data.siteOps?.openRfis);
  const overdueRfis = asNumber(data.siteOps?.overdueRfis);
  const openIssues = asNumber(data.siteOps?.openIssues);
  const openPunchItems = asNumber(data.siteOps?.openPunchItems);

  const usersTotal = asNumber(data.users?.total);
  const usersActive = asNumber(data.users?.active);

  const topModules = Array.isArray(data.audit?.topModules)
    ? data.audit.topModules.filter(
        (row): row is { module: string; count: number } =>
          row != null &&
          typeof row === 'object' &&
          typeof row.module === 'string' &&
          typeof row.count === 'number',
      )
    : [];

  const notStarted = asNumber(
    data.projects?.notStarted,
    byStatus.NOT_STARTED ?? 0,
  );
  const inProgress = asNumber(
    data.projects?.inProgress,
    byStatus.IN_PROGRESS ?? data.projects?.active ?? 0,
  );
  const onHold = asNumber(data.projects?.onHold, byStatus.ON_HOLD ?? 0);
  const cancelled = asNumber(
    data.projects?.cancelled,
    byStatus.CANCELLED ?? 0,
  );
  const completed = asNumber(
    data.projects?.completed,
    byStatus.COMPLETED ?? 0,
  );

  return {
    generatedAt:
      typeof data.generatedAt === 'string'
        ? data.generatedAt
        : new Date().toISOString(),
    companyName: data.companyName ?? fallbackCompanyName,
    baseCurrency: data.baseCurrency ?? 'USD',
    completionRate: asNumber(data.completionRate),
    projects: {
      total: asNumber(
        data.projects?.total,
        Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      ),
      notStarted,
      inProgress,
      onHold,
      cancelled,
      completed,
      active: inProgress,
      averageProgressPct:
        typeof data.projects?.averageProgressPct === 'number'
          ? data.projects.averageProgressPct
          : null,
      totalBudget:
        typeof data.projects?.totalBudget === 'string'
          ? data.projects.totalBudget
          : null,
      byStatus,
      byType,
    },
    users: {
      total: usersTotal,
      active: usersActive,
      inactive: asNumber(
        data.users?.inactive,
        Math.max(0, usersTotal - usersActive),
      ),
    },
    organization: {
      branches: asNumber(data.organization?.branches),
      departments: asNumber(data.organization?.departments),
    },
    audit: {
      last30Days: asNumber(data.audit?.last30Days),
      total: asNumber(data.audit?.total),
      topModules,
    },
    siteOps: {
      openRfis,
      overdueRfis,
      openIssues,
      openPunchItems,
      totalOpen: asNumber(
        data.siteOps?.totalOpen,
        openRfis + overdueRfis + openIssues + openPunchItems,
      ),
    },
  };
}
