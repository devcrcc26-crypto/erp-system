'use client';

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { PortfolioSummary } from '@/lib/api/reporting.types';

export const reportKeys = {
  all: ['reports'] as const,
  portfolioSummary: () => [...reportKeys.all, 'portfolio-summary'] as const,
};

export function usePortfolioSummary(
  enabled = true,
  options?: Omit<UseQueryOptions<PortfolioSummary>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: reportKeys.portfolioSummary(),
    queryFn: () => apiGet<PortfolioSummary>('/reports/portfolio-summary'),
    enabled,
    staleTime: 60_000,
    retry: false,
    ...options,
  });
}
