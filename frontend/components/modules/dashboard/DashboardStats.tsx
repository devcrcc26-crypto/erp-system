'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/components/StatCard';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useDashboardStats } from '@/lib/query/stats';
import { useAuthStore } from '@/stores/auth.store';
import { Network, ListTodo, PieChart } from 'lucide-react';
import ThreePeopleIcon from '@/components/ThreePeopleIcon';

const PLACEHOLDER = '—';

function formatCount(
  value: number | null | undefined,
  isLoading: boolean,
): string {
  if (isLoading) {
    return '…';
  }
  if (value === null || value === undefined) {
    return PLACEHOLDER;
  }
  return String(value);
}

function formatPercent(
  value: number | null | undefined,
  isLoading: boolean,
): string {
  if (isLoading) {
    return '…';
  }
  if (value === null || value === undefined) {
    return PLACEHOLDER;
  }
  return `${value}%`;
}

function StatsSection({
  projects,
  tasks,
  teamMembers,
  completionRate,
}: {
  projects: string;
  tasks: string;
  teamMembers: string;
  completionRate: string;
}): React.ReactNode {
  return (
    <section className="grid grid-cols-2 gap-4 md:gap-6 xl:grid-cols-4">
      <StatCard
        label="Projects"
        value={projects}
        icon={Network}
        iconBg="#dbeafe"
        iconColor="#2563eb"
      />
      <StatCard
        label="Tasks"
        value={tasks}
        icon={ListTodo}
        iconBg="#fef3c7"
        iconColor="#d97706"
      />
      <StatCard
        label="Team Members"
        value={teamMembers}
        icon={ThreePeopleIcon}
        iconBg="#dcfce7"
        iconColor="#16a34a"
      />
      <StatCard
        label="Completion Rate"
        value={completionRate}
        icon={PieChart}
        iconBg="#ede9fe"
        iconColor="#7c3aed"
      />
    </section>
  );
}

function LiveStats(): React.ReactNode {
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const canManageUsers = useAuthStore(
    (state) => state.capabilities.canManageUsers,
  );
  const canFetch = authHydrated && isAuthenticated && canManageUsers;

  const { data, isLoading, isFetching, isFetched } = useDashboardStats(canFetch);

  const loading = canFetch && !isFetched && (isLoading || isFetching);

  return (
    <StatsSection
      projects={formatCount(data?.branches, loading)}
      tasks={formatCount(data?.departments, loading)}
      teamMembers={formatCount(data?.teamMembers, loading)}
      completionRate={formatPercent(data?.completionRate, loading)}
    />
  );
}

export default function DashboardStats(): React.ReactNode {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <StatsSection
        projects={PLACEHOLDER}
        tasks={PLACEHOLDER}
        teamMembers={PLACEHOLDER}
        completionRate={PLACEHOLDER}
      />
    );
  }

  return <LiveStats />;
}
