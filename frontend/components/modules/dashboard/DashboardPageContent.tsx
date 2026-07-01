'use client';

import { useState } from 'react';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useAuthStore } from '@/stores/auth.store';
import FilterSection from '@/components/FilterSection';
import DashboardCharts from '@/components/charts/DashboardCharts';
import DashboardStats from '@/components/modules/dashboard/DashboardStats';
import { DEFAULT_DASHBOARD_FILTERS, type DashboardFilters } from '@/lib/dashboard/types';
import { usePortfolioDashboard } from '@/lib/query/dashboard';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';

export default function DashboardPageContent(): React.ReactNode {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_DASHBOARD_FILTERS);
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const canFetch = authHydrated && isAuthenticated;

  const dashboard = usePortfolioDashboard(filters, canFetch);

  const projectOptions = dashboard.projects.map((project) => ({
    value: project.id,
    label: `${project.projectCode} — ${formatLocalizedName(project)}`,
  }));

  return (
    <div className="flex flex-col gap-4">
      <DashboardStats
        completionRateOverride={canFetch ? dashboard.chartData.completionRate : undefined}
        completionLoading={dashboard.isLoading || dashboard.isFetching}
      />
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
  );
}
