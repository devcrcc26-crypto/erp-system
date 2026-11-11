'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { HrReport, HrReportParams } from '@/lib/api/reporting.types';

const HR_REPORT_PATH = '/hr/reports';

export const hrReportKeys = {
  all: ['hr-report'] as const,
  report: (params: HrReportParams) =>
    [...hrReportKeys.all, params] as const,
};

function reportQuery(params: HrReportParams): string {
  const search = new URLSearchParams();
  if (params.from) {
    search.set('from', params.from);
  }
  if (params.to) {
    search.set('to', params.to);
  }
  if (params.departmentId) {
    search.set('departmentId', params.departmentId);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Period HR report from GET /hr/reports. */
export function useHrReport(params: HrReportParams = {}, enabled = true) {
  return useQuery({
    queryKey: hrReportKeys.report(params),
    queryFn: () => apiGet<HrReport>(`${HR_REPORT_PATH}${reportQuery(params)}`),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
