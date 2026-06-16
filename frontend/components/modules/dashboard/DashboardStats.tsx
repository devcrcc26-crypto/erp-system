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
import { layout } from '@/lib/theme/layout';
import { useDashboardStats } from '@/lib/query/stats';

function formatCount(value: number | null | undefined, loading: boolean): string {
  if (loading) {
    return '—';
  }
  if (value === null || value === undefined) {
    return '—';
  }
  return value.toLocaleString();
}

function formatPercent(value: number | null | undefined, loading: boolean): string {
  if (loading) {
    return '—';
  }
  if (value === null || value === undefined) {
    return '—';
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
      iconBg: '#ffedd5',
      iconColor: '#c2410c',
    },
    {
      label: 'Active Projects',
      value: activeProjects,
      icon: CheckSquareOutlined,
      iconBg: '#dbeafe',
      iconColor: '#2563eb',
    },
    {
      label: 'Team Members',
      value: teamMembers,
      icon: TeamOutlined,
      iconBg: '#dcfce7',
      iconColor: '#16a34a',
    },
    {
      label: 'Completion Rate',
      value: completionRate,
      icon: RiseOutlined,
      iconBg: '#f3e8ff',
      iconColor: '#9333ea',
    },
  ];

  return (
    <div className={`${layout.cardGrid} sm:grid-cols-2 lg:grid-cols-4`}>
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

function LiveStats(): React.ReactNode {
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => Boolean(s.accessToken));
  const canFetch = authHydrated && isAuthenticated;
  const { data, isLoading, isFetching, isFetched } = useDashboardStats(canFetch);
  const loading = !isFetched || isLoading || isFetching;

  return (
    <StatsSection
      projects={formatCount(data?.projects, loading)}
      activeProjects={formatCount(data?.activeProjects, loading)}
      teamMembers={formatCount(data?.teamMembers, loading)}
      completionRate={formatPercent(data?.completionRate, loading)}
    />
  );
}

export default function DashboardStats(): React.ReactNode {
  return <LiveStats />;
}
