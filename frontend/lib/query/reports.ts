'use client';

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiClient, apiGet } from '@/lib/api/client';
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

export async function openSystemReportPdf(): Promise<void> {
  const response = await apiClient.get('/reports/system-report/pdf', { responseType: 'blob' });
  const contentType = response.headers['content-type'];
  const blob = new Blob([response.data as BlobPart], {
    type: typeof contentType === 'string' && contentType.includes('pdf') ? contentType : 'application/pdf',
  });
  const objectUrl = URL.createObjectURL(blob);
  const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
