'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiGetPaginated, apiPost } from '@/lib/api/client';
import type {
  ListSiteAssignmentsParams,
  SiteAssignmentDetail,
  SiteAssignmentListItem,
  SiteAssignmentPickerEmployee,
  CreateSiteAssignmentPayload,
} from '@/lib/api/site-assignment.types';
import type { PaginationMeta } from '@/lib/api/types';
import { overtimeKeys } from '@/lib/query/overtime';
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
  overtimeImpact: (id: string, endDate: string | null) =>
    [...siteAssignmentKeys.all, 'overtime-impact', id, endDate] as const,
  employees: (reportsTo: string | 'supervisors') =>
    [...siteAssignmentKeys.all, 'employees', reportsTo] as const,
};

const HR_EMPLOYEES_PATH = '/hr/employees';

export function useSiteAssignmentEmployees(
  reportsToUserId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: siteAssignmentKeys.employees(reportsToUserId ?? ''),
    queryFn: () =>
      apiGet<SiteAssignmentPickerEmployee[]>(
        `${HR_EMPLOYEES_PATH}?${new URLSearchParams({
          reportsTo: reportsToUserId ?? '',
        }).toString()}`,
      ),
    enabled: enabled && Boolean(reportsToUserId),
    staleTime: 60_000,
  });
}

export function useSiteAssignmentSupervisors(enabled = true) {
  return useQuery({
    queryKey: siteAssignmentKeys.employees('supervisors'),
    queryFn: () =>
      apiGet<SiteAssignmentPickerEmployee[]>(
        `${HR_EMPLOYEES_PATH}?siteAssignmentSupervisors=true`,
      ),
    enabled,
    staleTime: 60_000,
  });
}

/** Overtime entries a cancel (endDate null) or shorten would affect. */
export interface SiteAssignmentOvertimeImpact {
  /** Sheets not yet submitted: hours recalculated. */
  unsubmitted: number;
  /** Submitted/approved sheets: hours kept, entry flagged for HR. */
  submitted: number;
}

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

export function useEmployeeSiteAssignments(
  employeeId: string | undefined,
  enabled = true,
) {
  return useQuery({
    // Disabled (and never fetched) while employeeId is empty.
    queryKey: siteAssignmentKeys.employee(employeeId ?? ''),
    queryFn: () =>
      apiGet<SiteAssignmentListItem[]>(`${PATH}/employee/${employeeId}`),
    enabled: enabled && Boolean(employeeId),
  });
}

export function useSubmitSiteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSiteAssignmentPayload) =>
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
      // Overtime entries on those dates are re-priced or flagged.
      void queryClient.invalidateQueries({ queryKey: overtimeKeys.all });
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
      // Overtime entries on those dates are re-priced or flagged.
      void queryClient.invalidateQueries({ queryKey: overtimeKeys.all });
    },
  });
}

/** HR only. Pass endDate for a shorten, null for a cancel. */
export function useSiteAssignmentOvertimeImpact(
  id: string,
  endDate: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: siteAssignmentKeys.overtimeImpact(id, endDate),
    queryFn: () =>
      apiGet<SiteAssignmentOvertimeImpact>(
        `${PATH}/${id}/overtime-impact${endDate ? `?endDate=${endDate}` : ''}`,
      ),
    enabled: enabled && Boolean(id),
  });
}

export type { PaginationMeta };
