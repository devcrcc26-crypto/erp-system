'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiGetPaginated, apiPost } from '@/lib/api/client';
import type {
  ListSiteAssignmentsParams,
  SiteAssignmentDetail,
  SiteAssignmentListItem,
  SubmitSiteAssignmentPayload,
} from '@/lib/api/site-assignment.types';
import type { PaginationMeta } from '@/lib/api/types';
import { toQueryString } from '@/lib/query/pm-query-utils';

const PATH = '/hr/site-assignments';

export const siteAssignmentKeys = {
  all: ['site-assignment'] as const,
  lists: () => [...siteAssignmentKeys.all, 'list'] as const,
  list: (params: ListSiteAssignmentsParams) =>
    [...siteAssignmentKeys.lists(), params] as const,
  details: () => [...siteAssignmentKeys.all, 'detail'] as const,
  detail: (id: string) => [...siteAssignmentKeys.details(), id] as const,
  employee: (employeeId: string) =>
    [...siteAssignmentKeys.all, 'employee', employeeId] as const,
};

export function useSiteAssignments(params: ListSiteAssignmentsParams) {
  return useQuery({
    queryKey: siteAssignmentKeys.list(params),
    queryFn: () =>
      apiGetPaginated<SiteAssignmentListItem>(
        `${PATH}${toQueryString(params)}`,
      ),
  });
}

export function useSiteAssignment(id: string, enabled = true) {
  return useQuery({
    queryKey: siteAssignmentKeys.detail(id),
    queryFn: () => apiGet<SiteAssignmentDetail>(`${PATH}/${id}`),
    enabled: enabled && Boolean(id),
  });
}

export function useEmployeeSiteAssignments(employeeId: string, enabled = true) {
  return useQuery({
    queryKey: siteAssignmentKeys.employee(employeeId),
    queryFn: () =>
      apiGet<SiteAssignmentListItem[]>(`${PATH}/employee/${employeeId}`),
    enabled: enabled && Boolean(employeeId),
  });
}

export function useSubmitSiteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitSiteAssignmentPayload) =>
      apiPost<SiteAssignmentDetail>(PATH, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: siteAssignmentKeys.all });
    },
  });
}

export function useCancelSiteAssignment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<SiteAssignmentDetail>(`${PATH}/${id}/cancel`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: siteAssignmentKeys.all });
    },
  });
}

export function useCancelApprovedSiteAssignment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      apiPost<SiteAssignmentDetail>(`${PATH}/${id}/cancel-approved`, {
        reason,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: siteAssignmentKeys.all });
    },
  });
}

export function useShortenSiteAssignment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { endDate: string; reason: string }) =>
      apiPost<SiteAssignmentDetail>(`${PATH}/${id}/shorten`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: siteAssignmentKeys.all });
    },
  });
}

export type { PaginationMeta };
