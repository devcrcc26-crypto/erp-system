'use client';

import { useQuery } from '@tanstack/react-query';
import { silentApiGet, silentPaginatedTotal } from '@/lib/api/silent-request';
import type { ApiEnvelope } from '@/lib/api/types';

export interface DashboardStats {
  projects: number | null;
  activeProjects: number | null;
  teamMembers: number | null;
  completionRate: number | null;
}

function formatCount(value: number | null): string {
  if (value === null) {
    return '-';
  }
  return value.toLocaleString();
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return '-';
  }
  return `${value}%`;
}

async function fetchCompletionRate(): Promise<number | null> {
  try {
    const response = await silentApiGet('/reports/completion-rate');
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as ApiEnvelope<{ rate: number }>;
    if (!body.success || body.data?.rate == null) {
      return null;
    }
    return body.data.rate;
  } catch {
    return null;
  }
}

/** Portfolio KPIs - project counts from PM API; team/completion from core APIs when permitted. */
async function fetchDashboardStats(): Promise<DashboardStats> {
  const [projects, activeProjects, teamMembers, completionRate] = await Promise.all([
    silentPaginatedTotal('/projects'),
    silentPaginatedTotal('/projects', { status: 'IN_PROGRESS' }),
    silentPaginatedTotal('/users'),
    fetchCompletionRate(),
  ]);

  return {
    projects,
    activeProjects,
    teamMembers,
    completionRate,
  };
}

export function useDashboardStats(enabled = true) {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export { formatCount, formatPercent };
