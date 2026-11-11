'use client';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiGet, apiGetPaginated, apiPatch, apiPost, apiPostForm } from "../api/client";
import { ListOfficialSealsParams, OfficialSealDetail, OfficialSealListItem, SubmitOfficialSealPayload } from "../api/official-seal.types";
import { PaginatedResult } from "../api/types";
import { toQueryString } from "./pm-query-utils";
import { appendSealSubmitFields, sealSubmitJsonFields } from "../utils/seal-submit-fields";
import { approvalKeys } from "./approvals";

const OFFICIAL_SEAL_PATH = '/hr/official-seal';

export const officialSealKeys = {
    all: ['official-seal'] as const,
    lists: () => [...officialSealKeys.all, 'list'] as const,
    list: (params: ListOfficialSealsParams) => [...officialSealKeys.lists(), params] as const,
    details: () => [...officialSealKeys.all, 'detail'] as const,
    detail: (id: string) => [...officialSealKeys.details(), id] as const,
}

export function buildListQuery(params: ListOfficialSealsParams): string {
    const { status, ...rest } = params;
    const statusValue = Array.isArray(status)
        ? status.length > 0
            ? status.join(',')
            : undefined
        : status;
    return toQueryString({ ...rest, status: statusValue });
}

export function useOfficialSeals(
    params: ListOfficialSealsParams = {page: 1, limit: 20},
    enabled = true,
) {
    return useQuery({
        queryKey: officialSealKeys.list(params),
        queryFn: () =>
            apiGetPaginated<OfficialSealListItem>(
                `${OFFICIAL_SEAL_PATH}${buildListQuery(params)}`,
            ) as Promise<PaginatedResult<OfficialSealListItem>>,

        enabled,
        retry: false,
    });
}

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for the official seal list (filter locally).
 */
async function fetchAllOfficialSealPages(
  params: Omit<ListOfficialSealsParams, 'page' | 'limit' | 'search'> = {},
): Promise<OfficialSealListItem[]> {
  const first = await apiGetPaginated<OfficialSealListItem>(
    `${OFFICIAL_SEAL_PATH}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<OfficialSealListItem>(
        `${OFFICIAL_SEAL_PATH}${buildListQuery({
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

/** All official seals (all pages) for client-side filter/search. */
export function useOfficialSealsAll(
  params: Omit<ListOfficialSealsParams, 'page' | 'limit' | 'search'> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...officialSealKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllOfficialSealPages(params),
    enabled,
    retry: false,
  });
}

export function useOfficialSeal(id: string, enabled = true){
    return useQuery({
        queryKey: officialSealKeys.detail(id),
        queryFn: () =>
            apiGet<OfficialSealDetail>(
                `${OFFICIAL_SEAL_PATH}/${id}`,
            ) as Promise<OfficialSealDetail>,
        enabled,
        retry: false,
    });
}

export function useSubmitOfficialSeal() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: SubmitOfficialSealPayload) => {
            const hasFiles = (payload.files?.length ?? 0) > 0;
            if (hasFiles) {
                const formData = new FormData();
                formData.append('fileName', payload.fileName);
                formData.append('description', payload.description);
                formData.append('urgency', payload.urgency);
                formData.append('dateNeeded', payload.dateNeeded);
                appendSealSubmitFields(formData, payload);
                for (const file of payload.files ?? []) {
                    formData.append('files', file);
                }
                return apiPostForm<OfficialSealDetail>(OFFICIAL_SEAL_PATH, formData);
            }
            return apiPost<OfficialSealDetail>(
                OFFICIAL_SEAL_PATH,
                {
                    fileName: payload.fileName,
                    description: payload.description,
                    urgency: payload.urgency,
                    dateNeeded: payload.dateNeeded,
                    ...sealSubmitJsonFields(payload),
                },
            );
        },
            onSuccess: (created) => {
                void queryClient.invalidateQueries({
                    queryKey: officialSealKeys.lists(),
                });
                void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
                void queryClient.setQueryData(
                    officialSealKeys.detail(created.id),
                    created,
                );
            },
    });
}

export function useCancelOfficialSeal(id: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () =>
            apiPatch<OfficialSealDetail>(
                `${OFFICIAL_SEAL_PATH}/${id}/cancel`,
            ),
        onSuccess: (updated) => {
            void queryClient.invalidateQueries({
                queryKey: officialSealKeys.lists(),
            });
            void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
            void queryClient.setQueryData(
                officialSealKeys.detail(id),
                updated,
            );
        },
    });
}

export function useIssueOfficialSeal(id: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (file?: File) =>{
            if(file){
                const formData = new FormData();
                formData.append('file', file);
                return apiPostForm<OfficialSealDetail>(
                    `${OFFICIAL_SEAL_PATH}/${id}/seal`,
                    formData,
                );
            }
            return apiPost<OfficialSealDetail>(
                `${OFFICIAL_SEAL_PATH}/${id}/issue`,
            );
        },
        onSuccess: (updated) => {
            void queryClient.invalidateQueries({
                queryKey: officialSealKeys.lists(),
            });
            void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
            void queryClient.setQueryData(
                officialSealKeys.detail(id),
                updated,
            );
        },
    });
}
export async function openOfficialSealPdf(id: string): Promise<void> {
  const response = await apiClient.get(`${OFFICIAL_SEAL_PATH}/${id}/pdf`, { responseType: 'blob' });
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
