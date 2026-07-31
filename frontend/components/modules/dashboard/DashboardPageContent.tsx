'use client';

import { useState } from 'react';
import { Collapse, Spin } from 'antd';
import FilterSection from '@/components/FilterSection';
import DashboardCharts from '@/components/charts/DashboardCharts';
import HrDashboard from '@/components/modules/dashboard/HrDashboard';
import PersonalDashboard from '@/components/modules/dashboard/PersonalDashboard';
import PortfolioDashboard from '@/components/modules/dashboard/PortfolioDashboard';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import {
  useCapabilitiesReady,
  useEpcCapabilities,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { hasDesignCycleNavPersona } from '@/lib/navigation/project-nav-visibility';
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
 * True when the session is HR-focused and should not land on the project dashboard.
 * HR Officers (hr.view without project portfolio access) get the HR home.
 * Full-access / PM / design-cycle users keep the project dashboard.
 */
function usePreferHrDashboard(): boolean {
  const canViewHr = useCanViewHr();
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();

  if (!canViewHr) {
    return false;
  }
  if (epc.navFullAccess || hasDesignCycleNavPersona(epc)) {
    return false;
  }
  return !pm.projects.canView;
}

/**
 * Company home dashboard — HR, portfolio, or personal based on session capabilities.
 */
export default function DashboardPageContent(): React.ReactNode {
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const capabilitiesReady = useCapabilitiesReady();
  const epc = useEpcCapabilities();
  const preferHrDashboard = usePreferHrDashboard();
  const canFetch = authHydrated && isAuthenticated;
  const isFullAccess = epc.navFullAccess;

  if (!capabilitiesReady) {
    return (
      <div className={layout.loadingCard}>
        <Spin />
      </div>
    );
  }

  if (preferHrDashboard) {
    return (
      <div className={layout.pageStack}>
        <HrDashboard enabled={canFetch} />
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
