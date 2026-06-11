'use client';

import { useQuery } from '@tanstack/react-query';
import { apiPost } from '@/lib/api/client';
import { silentPaginatedTotal } from '@/lib/api/silent-request';
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

async function fetchCompletionRate(totalUsers: number | null): Promise<number | null> {
  if (totalUsers === null) {
    return null;
  }
  if (totalUsers === 0) {
    return 0;
  }

  try {
    const reportResult = await apiPost<ReportExecutionResult>(
      `/reports/${SEEDED_ACTIVE_USERS_REPORT_ID}/execute`,
    );
    if (reportResult.rowCount > 0) {
      return Math.round((reportResult.rowCount / totalUsers) * 100);
    }
    return 100;
  } catch {
    return null;
  }
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const [teamMembers, branches, departments] = await Promise.all([
    silentPaginatedTotal('/users'),
    silentPaginatedTotal('/branches'),
    silentPaginatedTotal('/departments'),
  ]);

  const completionRate = await fetchCompletionRate(teamMembers);

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
