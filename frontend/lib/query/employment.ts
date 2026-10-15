'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelSeparation,
  getEmployment,
  previewSeparation,
  separateEmployee,
  type SeparateEmployeePayload,
} from '@/lib/api/employment';
import { userKeys } from '@/lib/query/users';

export const employmentKeys = {
  detail: (userId: string) => ['users', 'employment', userId] as const,
  preview: (userId: string, leavingDate: string) =>
    ['users', 'employment', userId, 'preview', leavingDate] as const,
};

export function useEmployment(userId: string, enabled = true) {
  return useQuery({
    queryKey: employmentKeys.detail(userId),
    queryFn: () => getEmployment(userId),
    enabled: enabled && Boolean(userId),
  });
}

export function useSeparationPreview(userId: string, leavingDate: string | null) {
  return useQuery({
    queryKey: employmentKeys.preview(userId, leavingDate ?? ''),
    queryFn: () => previewSeparation(userId, leavingDate!),
    enabled: Boolean(userId && leavingDate),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, userId: string): void {
  void queryClient.invalidateQueries({ queryKey: employmentKeys.detail(userId) });
  void queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
  void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
  void queryClient.invalidateQueries({ queryKey: ['payroll'] });
}

export function useSeparateEmployee(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SeparateEmployeePayload) => separateEmployee(userId, payload),
    onSuccess: () => invalidate(queryClient, userId),
  });
}

export function useCancelSeparation(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelSeparation(userId),
    onSuccess: () => invalidate(queryClient, userId),
  });
}
