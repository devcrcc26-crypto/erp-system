'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { EarliestAllowedDateResponse } from '@/lib/api/backdating.types';
import { toQueryString } from '@/lib/query/pm-query-utils';

const PATH = '/hr/backdating/earliest-allowed-date';

export const backdatingKeys = {
  all: ['hr-backdating'] as const,
  earliest: (employeeId: string | undefined) =>
    [...backdatingKeys.all, 'earliest', employeeId ?? 'self'] as const,
};

export function useEarliestAllowedDate(employeeId: string | undefined) {
  return useQuery({
    queryKey: backdatingKeys.earliest(employeeId),
    enabled: Boolean(employeeId),
    queryFn: () =>
      apiGet<EarliestAllowedDateResponse>(
        `${PATH}${toQueryString({ employeeId: employeeId! })}`,
      ),
    staleTime: 60_000,
  });
}
