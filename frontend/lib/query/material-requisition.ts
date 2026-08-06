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
  AddMaterialRequisitionItemPayload,
  CreateMaterialRequisitionPayload,
  ListMaterialRequisitionsParams,
  MaterialRequisitionDetail,
  MaterialRequisitionListItem,
  UpdateMaterialRequisitionItemPayload,
  UpdateMaterialRequisitionPayload,
} from '@/lib/api/material-requisition.types';
import type { PaginationMeta } from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
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
