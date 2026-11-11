'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import type {
  CreateLeavePolicyPayload,
  LeavePolicy,
  UpdateLeavePolicyPayload,
} from '@/lib/api/leave-policy.types';
import type { LeavePolicySummary } from '@/lib/api/types';

const PATH = '/hr/leave-policies';

export const leavePolicyKeys = {
  all: ['leave-policies'] as const,
  lists: () => [...leavePolicyKeys.all, 'list'] as const,
  list: () => [...leavePolicyKeys.lists()] as const,
  active: () => [...leavePolicyKeys.all, 'active'] as const,
  details: () => [...leavePolicyKeys.all, 'detail'] as const,
  detail: (id: string) => [...leavePolicyKeys.details(), id] as const,
};

/**
 * Active policies for employee assignment pickers.
 */
export function useLeavePolicies(enabled = true) {
  return useQuery({
    queryKey: leavePolicyKeys.active(),
    queryFn: () => apiGet<LeavePolicySummary[]>(`${PATH}/active`),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Full HR leave policy list with rules and employee counts.
 */
export function useLeavePolicyList(enabled = true) {
  return useQuery({
    queryKey: leavePolicyKeys.list(),
    queryFn: () => apiGet<LeavePolicy[]>(PATH),
    enabled,
    staleTime: 30_000,
  });
}

export function useLeavePolicy(id: string, enabled = true) {
  return useQuery({
    queryKey: leavePolicyKeys.detail(id),
    queryFn: () => apiGet<LeavePolicy>(`${PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function useCreateLeavePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateLeavePolicyPayload) =>
      apiPost<LeavePolicy>(PATH, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leavePolicyKeys.all });
    },
  });
}

export function useUpdateLeavePolicy(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateLeavePolicyPayload) =>
      apiPatch<LeavePolicy>(`${PATH}/${id}`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leavePolicyKeys.all });
      void queryClient.invalidateQueries({
        queryKey: leavePolicyKeys.detail(id),
      });
    },
  });
}

export function useDeleteLeavePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`${PATH}/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leavePolicyKeys.all });
    },
  });
}

export function useRefreshLeaveBalances() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (year?: number) =>
      apiPost<{ refreshed: number }>(`${PATH}/refresh-balances`, {
        year,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
  });
}
