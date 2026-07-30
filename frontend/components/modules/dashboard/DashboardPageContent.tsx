'use client';

import { useState } from 'react';
import { Collapse, Spin } from 'antd';
import FilterSection from '@/components/FilterSection';
import DashboardCharts from '@/components/charts/DashboardCharts';
import PersonalDashboard from '@/components/modules/dashboard/PersonalDashboard';
import PortfolioDashboard from '@/components/modules/dashboard/PortfolioDashboard';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import {
  useCapabilitiesReady,
  useEpcCapabilities,
} from '@/hooks/use-pm-capabilities';
import { DEFAULT_DASHBOARD_FILTERS, type DashboardFilters } from '@/lib/dashboard/types';
import { usePortfolioDashboard } from '@/lib/query/dashboard';
import { layout } from '@/lib/theme/layout';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';
import { useAuthStore } from '@/stores/auth.store';

function ScheduleOverviewSection({
  enabled,
}: {
  enabled: boolean;
}): React.ReactNode {
  const [filters, setFilters] = useState<DashboardFilters>(
    DEFAULT_DASHBOARD_FILTERS,
  );
  const dashboard = usePortfolioDashboard(filters, enabled);

  const projectOptions = dashboard.projects.map((project) => ({
    value: project.id,
    label: `${project.projectCode} — ${formatLocalizedName(project)}`,
  }));

  return (
    <Collapse
      className="dashboard-schedule-collapse"
      items={[
        {
          key: 'schedule-overview',
          label: (
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
              Schedule Overview
            </span>
          ),
          children: (
            <div className={layout.sectionStack}>
              <FilterSection
                filters={filters}
                onChange={setFilters}
                projectOptions={projectOptions}
                disciplineOptions={dashboard.disciplineOptions}
              />
              <DashboardCharts
                data={dashboard.chartData}
                loading={dashboard.isLoading || dashboard.isFetching}
                taskCount={dashboard.filteredTaskCount}
              />
            </div>
          ),
        },
      ]}
    />
  );
}

/**
 * Company home dashboard — portfolio for full-access roles, personal for FK users.
 */
export default function DashboardPageContent(): React.ReactNode {
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const capabilitiesReady = useCapabilitiesReady();
  const epc = useEpcCapabilities();
  const canFetch = authHydrated && isAuthenticated;
  const isFullAccess = epc.navFullAccess;

  if (!capabilitiesReady) {
    return (
      <div className={layout.loadingCard}>
        <Spin />
      </div>
    );
  }

  return (
    <div className={layout.pageStack}>
      {isFullAccess ? (
        <PortfolioDashboard enabled={canFetch} />
      ) : (
        <PersonalDashboard enabled={canFetch} />
      )}
      <ScheduleOverviewSection enabled={canFetch} />
    </div>
  );
}
