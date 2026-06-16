'use client';

import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useAuthStore } from '@/stores/auth.store';
import { FolderKanban, CheckSquare, Users, TrendingUp } from 'lucide-react';
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
  loading,
}: {
  projects: string;
  activeProjects: string;
  teamMembers: string;
  completionRate: string;
  loading: boolean;
}): React.ReactNode {
  const cards = [
    {
      label: 'Projects',
      value: projects,
      icon: FolderKanban,
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
    },
    {
      label: 'Active Projects',
      value: activeProjects,
      icon: CheckSquare,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
    {
      label: 'Team Members',
      value: teamMembers,
      icon: Users,
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
    },
    {
      label: 'Completion Rate',
      value: completionRate,
      icon: TrendingUp,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">{card.label}</p>
              <p
                className={`mt-1 text-2xl font-bold text-gray-900 ${loading ? 'animate-pulse' : ''}`}
              >
                {card.value}
              </p>
            </div>
            <div className={`rounded-lg p-3 ${card.iconBg}`}>
              <card.icon className={`h-6 w-6 ${card.iconColor}`} />
            </div>
          </div>
        </div>
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
      loading={loading}
    />
  );
}

export default function DashboardStats(): React.ReactNode {
  return <LiveStats />;
}
