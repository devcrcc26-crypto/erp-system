'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
} from '@/lib/api/client';
import type {
  ListVehicleApplicationsParams,
  SubmitVehicleApplicationPayload,
  VehicleApplicationDetail,
  VehicleApplicationListItem,
} from '@/lib/api/vehicle-application.types';
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
