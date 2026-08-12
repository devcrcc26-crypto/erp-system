'use client';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiGetPaginated, apiPatch, apiPost } from "../api/client";
import { ListOfficialSealsParams, OfficialSealDetail, OfficialSealListItem, SubmitOfficialSealPayload } from "../api/official-seal.types";
import { PaginatedResult } from "../api/types";
import { toQueryString } from "./pm-query-utils";
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
        mutationFn: (payload: SubmitOfficialSealPayload) =>
            apiPost<OfficialSealDetail>(
                `${OFFICIAL_SEAL_PATH}`,
                payload,
            ),
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
                return apiPost<OfficialSealDetail>(
                    `${OFFICIAL_SEAL_PATH}/${id}/seal`,
                    formData,
                    { headers: { 'Content-Type': 'multipart/form-data' } },
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