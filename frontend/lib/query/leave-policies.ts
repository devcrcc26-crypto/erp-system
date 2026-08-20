'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { LeavePolicySummary } from '@/lib/api/types';

export const leavePolicyKeys = {
  all: ['leave-policies'] as const,
  list: () => [...leavePolicyKeys.all, 'list'] as const,
};

export function useLeavePolicies(enabled = true) {
  return useQuery({
    queryKey: leavePolicyKeys.list(),
    queryFn: () => apiGet<LeavePolicySummary[]>('/hr/leave-policies'),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
