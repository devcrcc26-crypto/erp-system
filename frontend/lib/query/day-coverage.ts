'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type {
  DayCoverageParams,
  DayCoverageResponse,
} from '@/lib/api/day-coverage.types';
import { toQueryString } from '@/lib/query/pm-query-utils';

const PATH = '/hr/day-coverage';

export const dayCoverageKeys = {
  all: ['hr-day-coverage'] as const,
  range: (params: DayCoverageParams | null) =>
    [
      ...dayCoverageKeys.all,
      params?.employeeId ?? null,
      params?.from ?? null,
      params?.to ?? null,
      params?.focus ?? null,
    ] as const,
};

/**
 * Loads leave / site / WFH / field-movement coverage for a date range.
 */
export function useDayCoverage(
  params: DayCoverageParams | null,
  enabled = true,
) {
  return useQuery({
    queryKey: dayCoverageKeys.range(params),
    enabled: Boolean(
      enabled && params?.employeeId && params.from && params.to,
    ),
    queryFn: () =>
      apiGet<DayCoverageResponse>(
        `${PATH}${toQueryString({
          employeeId: params!.employeeId,
          from: params!.from,
          to: params!.to,
          ...(params!.focus ? { focus: params!.focus } : {}),
        })}`,
      ),
    staleTime: 30_000,
  });
}
