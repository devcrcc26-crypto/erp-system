'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelSeparation,
  getEmployment,
  listInactivePeriods,
  previewSeparation,
  reactivateEmployee,
  rehireEmployee,
  separateEmployee,
  setInactive,
  updateLeavingDate,
  type RehirePayload,
  type SeparateEmployeePayload,
  type SetInactivePayload,
  type UpdateLeavingDatePayload,
} from '@/lib/api/employment';
import { attendanceKeys } from '@/lib/query/attendance';
import { employeeContractKeys } from '@/lib/query/employee-contract';
import { userKeys } from '@/lib/query/users';

export const employmentKeys = {
  detail: (userId: string) => ['users', 'employment', userId] as const,
  inactive: (userId: string) => ['users', 'employment', userId, 'inactive'] as const,
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

export function useInactivePeriods(userId: string, enabled = true) {
  return useQuery({
    queryKey: employmentKeys.inactive(userId),
    queryFn: () => listInactivePeriods(userId),
    enabled: enabled && Boolean(userId),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, userId: string): void {
  // Prefix match also refreshes the inactive-period list.
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

export function useUpdateLeavingDate(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateLeavingDatePayload) =>
      updateLeavingDate(userId, payload),
    onSuccess: () => {
      invalidate(queryClient, userId);
      void queryClient.invalidateQueries({ queryKey: employeeContractKeys.all });
    },
  });
}

export function useSetInactive(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SetInactivePayload) => setInactive(userId, payload),
    onSuccess: () => {
      invalidate(queryClient, userId);
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
    },
  });
}

export function useReactivateEmployee(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lastInactiveDate?: string) => reactivateEmployee(userId, lastInactiveDate),
    onSuccess: () => {
      invalidate(queryClient, userId);
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
    },
  });
}

export function useRehireEmployee(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RehirePayload) => rehireEmployee(userId, payload),
    onSuccess: () => {
      invalidate(queryClient, userId);
      void queryClient.invalidateQueries({ queryKey: employeeContractKeys.all });
    },
  });
}
