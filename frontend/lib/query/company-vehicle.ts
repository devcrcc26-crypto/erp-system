'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  apiDelete,
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
  apiPostForm,
} from '@/lib/api/client';
import type {
  AvailableVehicle,
  AvailableVehiclesParams,
  CompanyVehicleDetail,
  CompanyVehicleListItem,
  CreateCompanyVehiclePayload,
  ListCompanyVehiclesParams,
  UpdateCompanyVehiclePayload,
  UpdateCompanyVehicleStatusPayload,
} from '@/lib/api/company-vehicle.types';
import type { PaginationMeta } from '@/lib/api/types';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const VEHICLES_PATH = '/organization/vehicles';

export const companyVehicleKeys = {
  all: ['company-vehicles'] as const,
  lists: () => [...companyVehicleKeys.all, 'list'] as const,
  list: (params: ListCompanyVehiclesParams) =>
    [...companyVehicleKeys.lists(), params] as const,
  details: () => [...companyVehicleKeys.all, 'detail'] as const,
  detail: (id: string) => [...companyVehicleKeys.details(), id] as const,
  available: (params: AvailableVehiclesParams) =>
    [...companyVehicleKeys.all, 'available', params] as const,
};

export function useCompanyVehicles(
  params: ListCompanyVehiclesParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: companyVehicleKeys.list(params),
    queryFn: () =>
      apiGetPaginated<CompanyVehicleListItem>(
        `${VEHICLES_PATH}${toQueryString(params)}`,
      ) as Promise<PaginatedResult<CompanyVehicleListItem>>,
    enabled,
    retry: false,
  });
}

export function useCompanyVehicle(id: string, enabled = true) {
  return useQuery({
    queryKey: companyVehicleKeys.detail(id),
    queryFn: () => apiGet<CompanyVehicleDetail>(`${VEHICLES_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function useAvailableVehicles(
  params: AvailableVehiclesParams | null,
  enabled = true,
) {
  return useQuery({
    queryKey: companyVehicleKeys.available(params!),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params) {
        qs.set('departureDatetime', params.departureDatetime);
        qs.set('returnDatetime', params.returnDatetime);
      }
      return apiGet<AvailableVehicle[]>(`${VEHICLES_PATH}/available?${qs.toString()}`);
    },
    enabled: Boolean(params?.departureDatetime && params?.returnDatetime) && enabled,
    retry: false,
  });
}

export function useCreateCompanyVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCompanyVehiclePayload) =>
      apiPost<CompanyVehicleDetail>(VEHICLES_PATH, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyVehicleKeys.lists(),
      });
    },
  });
}

export function useUpdateCompanyVehicle(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateCompanyVehiclePayload) =>
      apiPatch<CompanyVehicleDetail>(`${VEHICLES_PATH}/${vehicleId}`, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: companyVehicleKeys.lists(),
      });
      void queryClient.setQueryData(
        companyVehicleKeys.detail(vehicleId),
        updated,
      );
    },
  });
}

export function useUpdateCompanyVehicleStatus(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateCompanyVehicleStatusPayload) =>
      apiPatch<CompanyVehicleDetail>(
        `${VEHICLES_PATH}/${vehicleId}/status`,
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyVehicleKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: companyVehicleKeys.detail(vehicleId),
      });
    },
  });
}

export function useDeleteCompanyVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: string) =>
      apiDelete<{ success: boolean }>(`${VEHICLES_PATH}/${vehicleId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyVehicleKeys.lists(),
      });
    },
  });
}

export function useUploadCompanyVehiclePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      vehicleId,
      file,
    }: {
      vehicleId: string;
      file: File;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<CompanyVehicleDetail>(
        `${VEHICLES_PATH}/${vehicleId}/photo`,
        formData,
      );
    },
    onSuccess: (updated, variables) => {
      void queryClient.invalidateQueries({
        queryKey: companyVehicleKeys.lists(),
      });
      void queryClient.setQueryData(
        companyVehicleKeys.detail(variables.vehicleId),
        updated,
      );
      void queryClient.invalidateQueries({
        queryKey: [
          ...companyVehicleKeys.detail(variables.vehicleId),
          'photo-url',
        ],
      });
    },
  });
}

export function useCompanyVehiclePhotoUrl(
  vehicleId: string,
  photoDocumentId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      ...companyVehicleKeys.detail(vehicleId),
      'photo-url',
      photoDocumentId,
    ] as const,
    queryFn: () =>
      apiGet<{ url: string; expiresIn: number }>(
        `${VEHICLES_PATH}/${vehicleId}/photo/download-url`,
      ),
    enabled: Boolean(vehicleId) && Boolean(photoDocumentId) && enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useDeleteCompanyVehiclePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: string) =>
      apiDelete<CompanyVehicleDetail>(`${VEHICLES_PATH}/${vehicleId}/photo`),
    onSuccess: (updated, vehicleId) => {
      void queryClient.invalidateQueries({
        queryKey: companyVehicleKeys.lists(),
      });
      void queryClient.setQueryData(companyVehicleKeys.detail(vehicleId), updated);
      void queryClient.invalidateQueries({
        queryKey: [...companyVehicleKeys.detail(vehicleId), 'photo-url'],
      });
    },
  });
}

const FETCH_PAGE_SIZE = 200;

/**
 * Loads every vehicle matching the given filters, page by page.
 *
 * The list page is server-paginated, so the export calls this at click time to
 * cover the whole filtered set rather than just the page on screen.
 */
export async function fetchAllCompanyVehicles(
  params: Omit<ListCompanyVehiclesParams, 'page' | 'limit'> = {},
): Promise<CompanyVehicleListItem[]> {
  const first = await apiGetPaginated<CompanyVehicleListItem>(
    `${VEHICLES_PATH}${toQueryString({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  if (first.meta.pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: first.meta.pages - 1 }, (_, index) =>
      apiGetPaginated<CompanyVehicleListItem>(
        `${VEHICLES_PATH}${toQueryString({
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
