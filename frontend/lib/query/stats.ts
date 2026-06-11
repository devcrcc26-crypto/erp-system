'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGetPaginated, apiPost } from '@/lib/api/client';
import type { ReportExecutionResult } from '@/lib/api/types';

/** Seeded report definition ID from backend/prisma/seed.ts */
export const SEEDED_ACTIVE_USERS_REPORT_ID =
  '00000000-0000-0000-0000-000000000050';

export interface DashboardStats {
  teamMembers: number | null;
  branches: number | null;
  departments: number | null;
  completionRate: number | null;
}

async function fetchCount(url: string): Promise<number | null> {
  try {
    const result = await apiGetPaginated<unknown>(`${url}?limit=1`);
    return result.meta.total;
  } catch {
    return null;
  }
}

async function fetchCompletionRate(): Promise<number | null> {
  try {
    const [usersResult, reportResult] = await Promise.all([
      apiGetPaginated<{ isActive?: boolean }>('/users?limit=100'),
      apiPost<ReportExecutionResult>(
        `/reports/${SEEDED_ACTIVE_USERS_REPORT_ID}/execute`,
      ),
    ]);

    const totalUsers = usersResult.meta.total;
    if (totalUsers === 0) {
      return 0;
    }

    const activeFromReport = reportResult.rowCount;
    if (activeFromReport > 0) {
      return Math.round((activeFromReport / totalUsers) * 100);
    }

    const activeFromList = usersResult.data.filter((u) => u.isActive).length;
    return Math.round((activeFromList / totalUsers) * 100);
  } catch {
    return null;
  }
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const [teamMembers, branches, departments, completionRate] =
    await Promise.all([
      fetchCount('/users'),
      fetchCount('/branches'),
      fetchCount('/departments'),
      fetchCompletionRate(),
    ]);

  return {
    teamMembers,
    branches,
    departments,
    completionRate,
  };
}

export function useDashboardStats(enabled = true) {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}
