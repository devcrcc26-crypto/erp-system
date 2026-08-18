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
  CompanyAssetDetail,
  CompanyAssetListItem,
  CreateCompanyAssetPayload,
  CompanyAssetAssignmentListItem,
  ListCompanyAssetsParams,
  ListCompanyAssetAssignmentsParams,
  UpdateCompanyAssetPayload,
  UpdateCompanyAssetStatusPayload,
  IssueCompanyAssetAssignmentPayload,
  ReturnCompanyAssetAssignmentPayload,
} from '@/lib/api/company-asset.types';
import type { PaginationMeta } from '@/lib/api/types';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const ASSETS_PATH = '/organization/assets';

export const companyAssetKeys = {
  all: ['company-assets'] as const,
  lists: () => [...companyAssetKeys.all, 'list'] as const,
  list: (params: ListCompanyAssetsParams) =>
    [...companyAssetKeys.lists(), params] as const,
  details: () => [...companyAssetKeys.all, 'detail'] as const,
  detail: (id: string) => [...companyAssetKeys.details(), id] as const,
  available: () => [...companyAssetKeys.all, 'available'] as const,
};

export function useCompanyAssets(
  params: ListCompanyAssetsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: companyAssetKeys.list(params),
    queryFn: () =>
      apiGetPaginated<CompanyAssetListItem>(
        `${ASSETS_PATH}${toQueryString(params)}`,
      ) as Promise<PaginatedResult<CompanyAssetListItem>>,
    enabled,
    retry: false,
  });
}

export function useCompanyAsset(id: string, enabled = true) {
  return useQuery({
    queryKey: companyAssetKeys.detail(id),
    queryFn: () => apiGet<CompanyAssetDetail>(`${ASSETS_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function useAvailableAssets(enabled = true) {
  return useQuery({
    queryKey: companyAssetKeys.available(),
    queryFn: () => apiGet<CompanyAssetListItem[]>(`${ASSETS_PATH}/available`),
    enabled,
    retry: false,
  });
}

export function useCreateCompanyAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCompanyAssetPayload) =>
      apiPost<CompanyAssetDetail>(ASSETS_PATH, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.lists(),
      });
    },
  });
}

export function useUpdateCompanyAsset(assetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateCompanyAssetPayload) =>
      apiPatch<CompanyAssetDetail>(`${ASSETS_PATH}/${assetId}`, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.lists(),
      });
      void queryClient.setQueryData(
        companyAssetKeys.detail(assetId),
        updated,
      );
    },
  });
}

export function useUpdateCompanyAssetStatus(assetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateCompanyAssetStatusPayload) =>
      apiPatch<CompanyAssetDetail>(
        `${ASSETS_PATH}/${assetId}/status`,
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.detail(assetId),
      });
    },
  });
}

export function useDeleteCompanyAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) =>
      apiDelete<{ success: boolean }>(`${ASSETS_PATH}/${assetId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.lists(),
      });
    },
  });
}

export function useCompanyAssetAssignments(
  assetId: string,
  params: ListCompanyAssetAssignmentsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: [...companyAssetKeys.detail(assetId), 'assignments', params],
    queryFn: () =>
      apiGetPaginated<CompanyAssetAssignmentListItem>(
        `${ASSETS_PATH}/${assetId}/assignments${toQueryString(params)}`,
      ) as Promise<PaginatedResult<CompanyAssetAssignmentListItem>>,
    enabled: Boolean(assetId) && enabled,
    retry: false,
  });
}

export function useIssueCompanyAssetAssignment(assetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IssueCompanyAssetAssignmentPayload) =>
      apiPost<CompanyAssetAssignmentListItem>(
        `${ASSETS_PATH}/${assetId}/assignments/issue`,
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.detail(assetId),
      });
      void queryClient.invalidateQueries({
        // Must match component's params to force a refetch.
        queryKey: [
          ...companyAssetKeys.detail(assetId),
          'assignments',
          { page: 1, limit: 1, includeReturned: true },
        ],
      });
    },
  });
}

export function useReturnCompanyAssetAssignment(
  assetId: string,
  assignmentId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReturnCompanyAssetAssignmentPayload) =>
      apiPost<CompanyAssetAssignmentListItem>(
        `${ASSETS_PATH}/${assetId}/assignments/${assignmentId}/return`,
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.detail(assetId),
      });
      void queryClient.invalidateQueries({
        // Must match component's params to force a refetch.
        queryKey: [
          ...companyAssetKeys.detail(assetId),
          'assignments',
          { page: 1, limit: 1, includeReturned: true },
        ],
      });
    },
  });
}

export function useUploadCompanyAssetPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assetId,
      file,
    }: {
      assetId: string;
      file: File;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<CompanyAssetDetail>(
        `${ASSETS_PATH}/${assetId}/photo`,
        formData,
      );
    },
    onSuccess: (updated, variables) => {
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.lists(),
      });
      void queryClient.setQueryData(
        companyAssetKeys.detail(variables.assetId),
        updated,
      );
    },
  });
}
