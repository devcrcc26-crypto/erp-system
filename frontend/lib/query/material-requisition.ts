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
  downloadApiFile,
} from '@/lib/api/client';
import type {
  AddMaterialRequisitionItemPayload,
  CreateMaterialRequisitionPayload,
  ListMaterialRequisitionsParams,
  MaterialRequisitionDetail,
  MaterialRequisitionListItem,
  UpdateMaterialRequisitionItemPayload,
  UpdateMaterialRequisitionPayload,
} from '@/lib/api/material-requisition.types';
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
  PaginationMeta,
} from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { invalidateAfterRequestEdit } from '@/lib/query/request-edit';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const MATERIAL_REQUISITION_PATH = '/hr/material-requisition';

export const materialRequisitionKeys = {
  all: ['material-requisition'] as const,
  lists: () => [...materialRequisitionKeys.all, 'list'] as const,
  list: (params: ListMaterialRequisitionsParams) =>
    [...materialRequisitionKeys.lists(), params] as const,
  details: () => [...materialRequisitionKeys.all, 'detail'] as const,
  detail: (id: string) =>
    [...materialRequisitionKeys.details(), id] as const,
};

function buildListQuery(params: ListMaterialRequisitionsParams): string {
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
 * Loads every page for the material requisitions list endpoint (filter locally).
 */
async function fetchAllMaterialRequisitionPages(
  params: Omit<ListMaterialRequisitionsParams, 'page' | 'limit' | 'search'> = {},
): Promise<MaterialRequisitionListItem[]> {
  const first = await apiGetPaginated<MaterialRequisitionListItem>(
    `${MATERIAL_REQUISITION_PATH}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<MaterialRequisitionListItem>(
        `${MATERIAL_REQUISITION_PATH}${buildListQuery({
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

/** All material requisitions (all pages) for client-side filter/search. */
export function useMaterialRequisitionsAll(
  params: Omit<ListMaterialRequisitionsParams, 'page' | 'limit' | 'search'> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...materialRequisitionKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllMaterialRequisitionPages(params),
    enabled,
    retry: false,
  });
}

/** Paginated material requisitions. */
export function useMaterialRequisitions(
  params: ListMaterialRequisitionsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: materialRequisitionKeys.list(params),
    queryFn: () =>
      apiGetPaginated<MaterialRequisitionListItem>(
        `${MATERIAL_REQUISITION_PATH}${buildListQuery(params)}`,
      ) as Promise<PaginatedResult<MaterialRequisitionListItem>>,
    enabled,
    retry: false,
  });
}

/** Single material requisition with items and approval tiers. */
export function useMaterialRequisition(id: string, enabled = true) {
  return useQuery({
    queryKey: materialRequisitionKeys.detail(id),
    queryFn: () =>
      apiGet<MaterialRequisitionDetail>(
        `${MATERIAL_REQUISITION_PATH}/${id}`,
      ),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/** Creates a new draft material requisition. */
export function useCreateMaterialRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMaterialRequisitionPayload) =>
      apiPost<MaterialRequisitionDetail>(MATERIAL_REQUISITION_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: materialRequisitionKeys.lists(),
      });
      void queryClient.setQueryData(
        materialRequisitionKeys.detail(created.id),
        created,
      );
    },
  });
}

/** Updates a draft or returned material requisition. */
export function useUpdateMaterialRequisition(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateMaterialRequisitionPayload) =>
      apiPatch<MaterialRequisitionDetail>(
        `${MATERIAL_REQUISITION_PATH}/${requisitionId}`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: materialRequisitionKeys.lists(),
      });
      void queryClient.setQueryData(
        materialRequisitionKeys.detail(requisitionId),
        updated,
      );
      invalidateAfterRequestEdit(queryClient);
    },
  });
}

/** Adds a line item to a draft material requisition. */
export function useAddMaterialRequisitionItem(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddMaterialRequisitionItemPayload) =>
      apiPost<MaterialRequisitionDetail>(
        `${MATERIAL_REQUISITION_PATH}/${requisitionId}/items`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        materialRequisitionKeys.detail(requisitionId),
        updated,
      );
    },
  });
}

/** Updates a line item on a draft material requisition. */
export function useUpdateMaterialRequisitionItem(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      payload,
    }: {
      itemId: string;
      payload: UpdateMaterialRequisitionItemPayload;
    }) =>
      apiPatch<MaterialRequisitionDetail>(
        `${MATERIAL_REQUISITION_PATH}/${requisitionId}/items/${itemId}`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        materialRequisitionKeys.detail(requisitionId),
        updated,
      );
    },
  });
}

/** Removes a line item from a draft material requisition. */
export function useDeleteMaterialRequisitionItem(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiDelete<MaterialRequisitionDetail>(
        `${MATERIAL_REQUISITION_PATH}/${requisitionId}/items/${itemId}`,
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        materialRequisitionKeys.detail(requisitionId),
        updated,
      );
    },
  });
}

/** Submits a draft material requisition for approval (multipart with optional files). */
export function useSubmitMaterialRequisition(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      return apiPostForm<MaterialRequisitionDetail>(
        `${MATERIAL_REQUISITION_PATH}/${requisitionId}/submit`,
        formData,
      );
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: materialRequisitionKeys.lists(),
      });
      void queryClient.setQueryData(
        materialRequisitionKeys.detail(requisitionId),
        updated,
      );
    },
  });
}

/** Cancels a draft or submitted material requisition. */
export function useCancelMaterialRequisition(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<MaterialRequisitionDetail>(
        `${MATERIAL_REQUISITION_PATH}/${requisitionId}/cancel`,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: materialRequisitionKeys.lists(),
      });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(
        materialRequisitionKeys.detail(requisitionId),
        updated,
      );
    },
  });
}

/**
 * Loads material requisition details in batches (for list item export).
 */
export async function fetchMaterialRequisitionDetails(
  requisitionIds: string[],
): Promise<MaterialRequisitionDetail[]> {
  const results: MaterialRequisitionDetail[] = [];
  const batchSize = 8;
  for (let index = 0; index < requisitionIds.length; index += batchSize) {
    const batch = requisitionIds.slice(index, index + batchSize);
    const pages = await Promise.all(
      batch.map((id) =>
        apiGet<MaterialRequisitionDetail>(`${MATERIAL_REQUISITION_PATH}/${id}`),
      ),
    );
    results.push(...pages);
  }
  return results;
}

/**
 * Preview company-wide material requisition Excel import.
 */
export function useMaterialRequisitionImportPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${MATERIAL_REQUISITION_PATH}/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit company-wide material requisition Excel import.
 */
export function useMaterialRequisitionImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${MATERIAL_REQUISITION_PATH}/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: materialRequisitionKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: materialRequisitionKeys.details(),
      });
    },
  });
}

/**
 * Downloads the company-wide material requisition import template.
 */
export async function downloadMaterialRequisitionImportTemplate(): Promise<void> {
  await downloadApiFile(
    `${MATERIAL_REQUISITION_PATH}/import/template`,
    'material-requisition-import-template.xlsx',
  );
}

/**
 * Preview requisition-scoped item Excel import.
 */
export function useMaterialRequisitionItemsImportPreview(
  requisitionId: string,
) {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${MATERIAL_REQUISITION_PATH}/${requisitionId}/items/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit requisition-scoped item Excel import.
 */
export function useMaterialRequisitionItemsImport(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${MATERIAL_REQUISITION_PATH}/${requisitionId}/items/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: materialRequisitionKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: materialRequisitionKeys.detail(requisitionId),
      });
    },
  });
}

/**
 * Downloads the requisition-scoped items import template.
 */
export async function downloadMaterialRequisitionItemsImportTemplate(
  requisitionId: string,
): Promise<void> {
  await downloadApiFile(
    `${MATERIAL_REQUISITION_PATH}/${requisitionId}/items/import/template`,
    'material-requisition-items-import-template.xlsx',
  );
}

export async function openMaterialRequisitionPdf(id: string): Promise<void> {
  const response = await apiClient.get(`${MATERIAL_REQUISITION_PATH}/${id}/pdf`, { responseType: 'blob' });
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
