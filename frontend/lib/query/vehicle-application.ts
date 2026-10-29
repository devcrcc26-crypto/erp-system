'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  apiClient,
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
} from '@/lib/api/client';
import type {
  ListVehicleApplicationsParams,
  SubmitVehicleApplicationPayload,
  UpdateVehicleApplicationPayload,
  VehicleApplicationDetail,
  VehicleApplicationListItem,
} from '@/lib/api/vehicle-application.types';
import { invalidateAfterRequestEdit } from '@/lib/query/request-edit';
import type { PaginationMeta } from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const APPLICATIONS_PATH = '/hr/vehicle-applications';

export const vehicleApplicationKeys = {
  all: ['vehicle-applications'] as const,
  lists: () => [...vehicleApplicationKeys.all, 'list'] as const,
  list: (params: ListVehicleApplicationsParams) =>
    [...vehicleApplicationKeys.lists(), params] as const,
  details: () => [...vehicleApplicationKeys.all, 'detail'] as const,
  detail: (id: string) =>
    [...vehicleApplicationKeys.details(), id] as const,
};

function buildListQuery(params: ListVehicleApplicationsParams): string {
  const { status, ...rest } = params;
  const statusValue = Array.isArray(status)
    ? status.length > 0
      ? status.join(',')
      : undefined
    : status;
  return toQueryString({ ...rest, status: statusValue });
}

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for the vehicle applications list (filter locally).
 */
async function fetchAllVehicleApplicationPages(
  params: Omit<
    ListVehicleApplicationsParams,
    'page' | 'limit' | 'search'
  > = {},
): Promise<VehicleApplicationListItem[]> {
  const first = await apiGetPaginated<VehicleApplicationListItem>(
    `${APPLICATIONS_PATH}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<VehicleApplicationListItem>(
        `${APPLICATIONS_PATH}${buildListQuery({
          ...params,
          page: index + 2,
          limit: FETCH_PAGE_SIZE,
        })}`,
      ),
    ),
  );

  for (const page of rest) {
    all.push(...page.data);
  }
  return all;
}

export function useVehicleApplications(
  params: ListVehicleApplicationsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: vehicleApplicationKeys.list(params),
    queryFn: () =>
      apiGetPaginated<VehicleApplicationListItem>(
        `${APPLICATIONS_PATH}${buildListQuery(params)}`,
      ) as Promise<PaginatedResult<VehicleApplicationListItem>>,
    enabled,
    retry: false,
  });
}

/** All vehicle applications (all pages) for client-side filter/search. */
export function useVehicleApplicationsAll(
  params: Omit<
    ListVehicleApplicationsParams,
    'page' | 'limit' | 'search'
  > = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...vehicleApplicationKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllVehicleApplicationPages(params),
    enabled,
    retry: false,
  });
}

export function useVehicleApplication(id: string, enabled = true) {
  return useQuery({
    queryKey: vehicleApplicationKeys.detail(id),
    queryFn: () =>
      apiGet<VehicleApplicationDetail>(`${APPLICATIONS_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function useSubmitVehicleApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitVehicleApplicationPayload) =>
      apiPost<VehicleApplicationDetail>(APPLICATIONS_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: vehicleApplicationKeys.lists(),
      });
      void queryClient.setQueryData(
        vehicleApplicationKeys.detail(created.id),
        created,
      );
    },
  });
}

/** Employee edit of a DRAFT / RETURNED application (RETURNED is resubmitted). */
export function useUpdateVehicleApplication(applicationId: string) {
  const queryClient = useQueryClient();
  const detailKey = vehicleApplicationKeys.detail(applicationId);
  return useMutation({
    mutationFn: (payload: UpdateVehicleApplicationPayload) =>
      apiPatch<VehicleApplicationDetail>(
        `${APPLICATIONS_PATH}/${applicationId}`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: vehicleApplicationKeys.lists(),
      });
      queryClient.setQueryData(detailKey, updated);
      invalidateAfterRequestEdit(queryClient);
    },
  });
}

export function useCancelVehicleApplication(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<VehicleApplicationDetail>(
        `${APPLICATIONS_PATH}/${applicationId}/cancel`,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: vehicleApplicationKeys.lists(),
      });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(
        vehicleApplicationKeys.detail(applicationId),
        updated,
      );
    },
  });
}

export function useReleaseVehicleApplication(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<VehicleApplicationDetail>(
        `${APPLICATIONS_PATH}/${applicationId}/release`,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: vehicleApplicationKeys.lists(),
      });
      void queryClient.setQueryData(
        vehicleApplicationKeys.detail(applicationId),
        updated,
      );
    },
  });
}

export async function openVehicleApplicationPdf(id: string): Promise<void> {
  const response = await apiClient.get(`${APPLICATIONS_PATH}/${id}/pdf`, { responseType: 'blob' });
  const contentType = response.headers['content-type'];
  const blob = new Blob([response.data as BlobPart], {
    type: typeof contentType === 'string' && contentType.includes('pdf') ? contentType : 'application/pdf',
  });
  const objectUrl = URL.createObjectURL(blob);
  const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
