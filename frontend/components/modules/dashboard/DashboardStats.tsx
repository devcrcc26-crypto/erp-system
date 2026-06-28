// UI polish pass - styles only, no logic changes

'use client';

import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useAuthStore } from '@/stores/auth.store';
import {
  ProjectOutlined,
  CheckSquareOutlined,
  TeamOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import KPICard from '@/components/ui/KPICard/KPICard';
import { tokens } from '@/lib/theme/tokens';
import { useDashboardStats } from '@/lib/query/stats';

function formatCount(value: number | null | undefined, loading: boolean): string {
  if (loading) {
    return '-';
  }
  if (value === null || value === undefined) {
    return '-';
  }
  return value.toLocaleString();
}

function formatPercent(value: number | null | undefined, loading: boolean): string {
  if (loading) {
    return '-';
  }
  if (value === null || value === undefined) {
    return '-';
  }
  return `${value}%`;
}

function StatsSection({
  projects,
  activeProjects,
  teamMembers,
  completionRate,
}: {
  projects: string;
  activeProjects: string;
  teamMembers: string;
  completionRate: string;
}): React.ReactNode {
  const cards = [
    {
      label: 'Projects',
      value: projects,
      icon: ProjectOutlined,
      iconBg: tokens.colorTeal50,
      iconColor: tokens.colorTeal600,
    },
    {
      label: 'Active Projects',
      value: activeProjects,
      icon: CheckSquareOutlined,
      iconBg: tokens.colorBlue50,
      iconColor: tokens.colorBlue400,
    },
    {
      label: 'Team Members',
      value: teamMembers,
      icon: TeamOutlined,
      iconBg: tokens.colorGreen50,
      iconColor: tokens.colorGreen600,
    },
    {
      label: 'Completion Rate',
      value: completionRate,
      icon: RiseOutlined,
      iconBg: tokens.colorAmber50,
      iconColor: tokens.colorAmber400,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <KPICard
          key={card.label}
          label={card.label}
          value={card.value}
          icon={card.icon}
          iconBg={card.iconBg}
          iconColor={card.iconColor}
        />
      ))}
    </div>
  );
}

function LiveStats({
  completionRateOverride,
  completionLoading = false,
}: {
  completionRateOverride?: number;
  completionLoading?: boolean;
}): React.ReactNode {
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => Boolean(s.accessToken));
  const canFetch = authHydrated && isAuthenticated;
  const { data, isLoading, isFetching, isFetched } = useDashboardStats(canFetch);
  const loading = !isFetched || isLoading || isFetching;

  const completionRate =
    completionRateOverride != null
      ? formatPercent(completionRateOverride, completionLoading)
      : formatPercent(data?.completionRate, loading);

  return (
    <StatsSection
      projects={formatCount(data?.projects, loading)}
      activeProjects={formatCount(data?.activeProjects, loading)}
      teamMembers={formatCount(data?.teamMembers, loading)}
      completionRate={completionRate}
    />
  );
}

export default function DashboardStats({
  completionRateOverride,
  completionLoading = false,
}: {
  completionRateOverride?: number;
  completionLoading?: boolean;
} = {}): React.ReactNode {
  return (
    <LiveStats
      completionRateOverride={completionRateOverride}
      completionLoading={completionLoading}
    />
  );
}
