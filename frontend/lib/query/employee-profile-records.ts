'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api/client';
import type {
  EducationRecordInput,
  PositionHistoryEntry,
  PriorEmploymentInput,
} from '@/lib/api/types';

export const employeeProfileRecordKeys = {
  education: (userId: string) => ['users', userId, 'education'] as const,
  priorEmployment: (userId: string) => ['users', userId, 'prior-employment'] as const,
  positionHistory: (userId: string) => ['users', userId, 'position-history'] as const,
};

export function useEducationRecords(userId: string | undefined) {
  return useQuery({
    queryKey: employeeProfileRecordKeys.education(userId ?? ''),
    queryFn: () => apiGet<EducationRecordInput[]>(`/users/${userId}/education`),
    enabled: Boolean(userId),
  });
}

export function usePriorEmployments(userId: string | undefined) {
  return useQuery({
    queryKey: employeeProfileRecordKeys.priorEmployment(userId ?? ''),
    queryFn: () => apiGet<PriorEmploymentInput[]>(`/users/${userId}/prior-employment`),
    enabled: Boolean(userId),
  });
}

export function usePositionHistory(userId: string | undefined) {
  return useQuery({
    queryKey: employeeProfileRecordKeys.positionHistory(userId ?? ''),
    queryFn: () => apiGet<PositionHistoryEntry[]>(`/users/${userId}/position-history`),
    enabled: Boolean(userId),
  });
}

export function useCreatePositionHistory(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      positionId?: string | null;
      salaryOverride?: number | null;
      effectiveFrom: string;
      note?: string | null;
    }) => apiPost<PositionHistoryEntry>(`/users/${userId}/position-history`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: employeeProfileRecordKeys.positionHistory(userId),
      });
    },
  });
}

export function useDeletePositionHistory(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) =>
      apiDelete<{ message: string }>(`/users/${userId}/position-history/${recordId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: employeeProfileRecordKeys.positionHistory(userId),
      });
    },
  });
}
