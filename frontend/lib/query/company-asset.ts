'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  apiClient,
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
  AcknowledgeAssetReturnPayload,
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
  mine: () => [...companyAssetKeys.all, 'mine'] as const,
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

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for the company asset register (filter locally).
 */
async function fetchAllCompanyAssetPages(
  params: Omit<ListCompanyAssetsParams, 'page' | 'limit' | 'search'> = {},
): Promise<CompanyAssetListItem[]> {
  const first = await apiGetPaginated<CompanyAssetListItem>(
    `${ASSETS_PATH}${toQueryString({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<CompanyAssetListItem>(
        `${ASSETS_PATH}${toQueryString({
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

/** All company assets (all pages) for client-side filter/search. */
export function useCompanyAssetsAll(
  params: Omit<ListCompanyAssetsParams, 'page' | 'limit' | 'search'> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...companyAssetKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllCompanyAssetPages(params),
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

/** Assets currently assigned to the signed-in employee (profile self-service). */
export function useMyCompanyAssets(enabled = true) {
  return useQuery({
    queryKey: companyAssetKeys.mine(),
    queryFn: () => apiGet<CompanyAssetListItem[]>(`${ASSETS_PATH}/my`),
    enabled,
    staleTime: 60_000,
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
        queryKey: [...companyAssetKeys.detail(assetId), 'assignments'],
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
        queryKey: [...companyAssetKeys.detail(assetId), 'assignments'],
      });
    },
  });
}

export function useInitiateAssetReturn(assetId: string, assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReturnCompanyAssetAssignmentPayload) =>
      apiPost<CompanyAssetAssignmentListItem>(
        `${ASSETS_PATH}/${assetId}/assignments/${assignmentId}/initiate-return`,
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: companyAssetKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: companyAssetKeys.detail(assetId) });
      void queryClient.invalidateQueries({
        queryKey: [...companyAssetKeys.detail(assetId), 'assignments'],
      });
    },
  });
}

export function useAcknowledgeAssetReturn(assetId: string, assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AcknowledgeAssetReturnPayload) =>
      apiPost<CompanyAssetAssignmentListItem>(
        `${ASSETS_PATH}/${assetId}/assignments/${assignmentId}/acknowledge-return`,
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: companyAssetKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: companyAssetKeys.detail(assetId) });
      void queryClient.invalidateQueries({
        queryKey: [...companyAssetKeys.detail(assetId), 'assignments'],
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
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.mine(),
      });
      void queryClient.setQueryData(
        companyAssetKeys.detail(variables.assetId),
        updated,
      );
      void queryClient.invalidateQueries({
        queryKey: [
          ...companyAssetKeys.detail(variables.assetId),
          'photo-url',
        ],
      });
    },
  });
}

export function useCompanyAssetPhotoUrl(
  assetId: string,
  photoDocumentId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      ...companyAssetKeys.detail(assetId),
      'photo-url',
      photoDocumentId,
    ] as const,
    queryFn: () =>
      apiGet<{ url: string; expiresIn: number }>(
        `${ASSETS_PATH}/${assetId}/photo/download-url`,
      ),
    enabled: Boolean(assetId) && Boolean(photoDocumentId) && enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useDeleteCompanyAssetPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) =>
      apiDelete<CompanyAssetDetail>(`${ASSETS_PATH}/${assetId}/photo`),
    onSuccess: (updated, assetId) => {
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: companyAssetKeys.mine(),
      });
      void queryClient.setQueryData(companyAssetKeys.detail(assetId), updated);
      void queryClient.invalidateQueries({
        queryKey: [...companyAssetKeys.detail(assetId), 'photo-url'],
      });
    },
  });
}

export async function openCompanyAssetPdf(id: string): Promise<void> {
  const response = await apiClient.get(`${ASSETS_PATH}/${id}/pdf`, { responseType: 'blob' });
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
