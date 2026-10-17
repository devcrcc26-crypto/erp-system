'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type {
  InitiableEmployees,
  InitiatorModuleCode,
  OnBehalfChainMembership,
  OnBehalfEligibleEmployee,
  OnBehalfModuleCode,
} from '@/lib/api/on-behalf.types';

const ON_BEHALF_PATH = '/hr/on-behalf';

export const onBehalfKeys = {
  all: ['on-behalf'] as const,
  eligible: (userId: string | undefined, companyId: string | undefined) =>
    [...onBehalfKeys.all, 'eligible', userId ?? '', companyId ?? ''] as const,
  chain: (employeeId: string, moduleCode: OnBehalfModuleCode) =>
    [...onBehalfKeys.all, 'chain', moduleCode, employeeId] as const,
  initiable: (userId: string | undefined, moduleCode: InitiatorModuleCode) =>
    [...onBehalfKeys.all, 'initiable', moduleCode, userId ?? ''] as const,
};

/**
 * Site assignment / WFH / flight / business trip: who the signed-in user may
 * file for under allowedInitiators, and whether they may file for themselves.
 */
export function useInitiableEmployees(
  userId: string | undefined,
  moduleCode: InitiatorModuleCode | null,
) {
  return useQuery({
    queryKey: onBehalfKeys.initiable(userId, moduleCode ?? 'SITE_ASSIGNMENT'),
    queryFn: () =>
      apiGet<InitiableEmployees>(
        `${ON_BEHALF_PATH}/initiable-employees?module=${moduleCode}`,
      ),
    enabled: Boolean(userId) && moduleCode !== null,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Employees the signed-in user may submit HR requests for (empty = no on-behalf access).
 */
export function useOnBehalfEligibleEmployees(
  userId: string | undefined,
  companyId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: onBehalfKeys.eligible(userId, companyId),
    queryFn: () =>
      apiGet<OnBehalfEligibleEmployee[]>(`${ON_BEHALF_PATH}/eligible-employees`),
    enabled: enabled && Boolean(userId),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * Whether the signed-in user holds a tier in the target employee's approval chain.
 */
export function useOnBehalfChainMembership(
  employeeId: string | undefined,
  moduleCode: OnBehalfModuleCode,
) {
  return useQuery({
    queryKey: onBehalfKeys.chain(employeeId ?? '', moduleCode),
    queryFn: () =>
      apiGet<OnBehalfChainMembership>(
        `${ON_BEHALF_PATH}/is-in-chain?${new URLSearchParams({
          employeeId: employeeId ?? '',
          module: moduleCode,
        }).toString()}`,
      ),
    enabled: Boolean(employeeId),
    retry: false,
  });
}
