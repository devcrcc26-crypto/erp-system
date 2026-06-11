'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/components/StatCard';
import { useDashboardStats } from '@/lib/query/stats';
import { useAuthStore } from '@/stores/auth.store';
import { Network, ListTodo, PieChart } from 'lucide-react';
import ThreePeopleIcon from '@/components/ThreePeopleIcon';

const FALLBACK = {
  projects: '19',
  tasks: '37',
  teamMembers: '69',
  completionRate: '63%',
} as const;

function formatCount(value: number | null, fallback: string, isLoading: boolean): string {
  if (isLoading) {
    return '…';
  }
  if (value === null) {
    return fallback;
  }
  return String(value);
}

function formatPercent(value: number | null, fallback: string, isLoading: boolean): string {
  if (isLoading) {
    return '…';
  }
  if (value === null) {
    return fallback;
  }
  return `${value}%`;
}

function FallbackStats(): React.ReactNode {
  return (
    <section className="grid grid-cols-2 gap-4 md:gap-6 xl:grid-cols-4">
      <StatCard
        label="Projects"
        value={FALLBACK.projects}
        icon={Network}
        iconBg="#dbeafe"
        iconColor="#2563eb"
      />
      <StatCard
        label="Tasks"
        value={FALLBACK.tasks}
        icon={ListTodo}
        iconBg="#fef3c7"
        iconColor="#d97706"
      />
      <StatCard
        label="Team Members"
        value={FALLBACK.teamMembers}
        icon={ThreePeopleIcon}
        iconBg="#dcfce7"
        iconColor="#16a34a"
      />
      <StatCard
        label="Completion Rate"
        value={FALLBACK.completionRate}
        icon={PieChart}
        iconBg="#ede9fe"
        iconColor="#7c3aed"
      />
    </section>
  );
}

function LiveStats(): React.ReactNode {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const { data, isLoading, isFetching, isFetched } = useDashboardStats(isAuthenticated);

  const loading = isAuthenticated && (isLoading || isFetching) && !isFetched;

  return (
    <section className="grid grid-cols-2 gap-4 md:gap-6 xl:grid-cols-4">
      <StatCard
        label="Projects"
        value={formatCount(data?.branches ?? null, FALLBACK.projects, loading)}
        icon={Network}
        iconBg="#dbeafe"
        iconColor="#2563eb"
      />
      <StatCard
        label="Tasks"
        value={formatCount(data?.departments ?? null, FALLBACK.tasks, loading)}
        icon={ListTodo}
        iconBg="#fef3c7"
        iconColor="#d97706"
      />
      <StatCard
        label="Team Members"
        value={formatCount(data?.teamMembers ?? null, FALLBACK.teamMembers, loading)}
        icon={ThreePeopleIcon}
        iconBg="#dcfce7"
        iconColor="#16a34a"
      />
      <StatCard
        label="Completion Rate"
        value={formatPercent(data?.completionRate ?? null, FALLBACK.completionRate, loading)}
        icon={PieChart}
        iconBg="#ede9fe"
        iconColor="#7c3aed"
      />
    </section>
  );
}

export default function DashboardStats(): React.ReactNode {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <FallbackStats />;
  }

  return <LiveStats />;
}
