import { toQueryString } from "./pm-query-utils";
import { ListProjectSealsParams, ProjectSealDetail, ProjectSealListItem, SubmitProjectSealPayload } from "../api/project-seal.types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PaginatedResult } from "../api/types";
import { apiGet, apiGetPaginated, apiPatch, apiPost, apiPostForm } from "../api/client";
import { approvalKeys } from "./approvals";


const PROJECT_SEAL_PATH = '/hr/project-seal';

export const projectSealKeys = {
    all: ['project-seal'] as const,
    lists: () => [...projectSealKeys.all, 'list'] as const,
    list: (params: ListProjectSealsParams) => [...projectSealKeys.lists(), params] as const,
    details: () => [...projectSealKeys.all, 'detail'] as const,
    detail: (id: string) => [...projectSealKeys.details(), id] as const,
}

export function buildListQuery(params: ListProjectSealsParams): string {
    const { status, ...rest } = params;
    const statusValue = Array.isArray(status)
        ? status.length > 0
            ? status.join(',')
            : undefined
        : status;
    return toQueryString({ ...rest, status: statusValue });
}

export function useProjectSeals(
    params: ListProjectSealsParams = {page: 1, limit: 20},
    enabled = true,
) {
    return useQuery({
        queryKey: projectSealKeys.list(params),
        queryFn: () =>
            apiGetPaginated<ProjectSealListItem>(
                `${PROJECT_SEAL_PATH}${buildListQuery(params)}`
            ) as Promise<PaginatedResult<ProjectSealListItem>>,
        enabled,
        retry: false,
    });
}

export function useProjectSeal(id: string, enabled = true) {
    return useQuery({
        queryKey: projectSealKeys.detail(id),
        queryFn: () =>
            apiGet<ProjectSealDetail>(`${PROJECT_SEAL_PATH}/${id}`) as Promise<ProjectSealDetail>,
        enabled,
        retry: false,
    });
}

export function useSubmitProjectSeal() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: SubmitProjectSealPayload) =>{
            const hasFiles = (payload.files?.length ?? 0) > 0;
            if (hasFiles) {
                const formData = new FormData();
                formData.append('description', payload.description);
                formData.append('urgency', payload.urgency);
                formData.append('dateNeeded', payload.dateNeeded);
                for (const file of payload.files ?? []) {
                    formData.append('files', file);
                }
                return apiPostForm<ProjectSealDetail>(PROJECT_SEAL_PATH, formData);
        }
        return apiPost<ProjectSealDetail>(
            PROJECT_SEAL_PATH, 
            {
            description: payload.description,
            urgency: payload.urgency,
            dateNeeded: payload.dateNeeded,
        });
    },
    onSuccess: (created) => {
        void queryClient.invalidateQueries({ queryKey: projectSealKeys.lists() });
        void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
        void queryClient.setQueryData(
            projectSealKeys.detail(created.id),
            created
        );
    },
});
}


export function useCancelProjectSeal(id: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => 
            apiPatch<ProjectSealDetail>(
                `${PROJECT_SEAL_PATH}/${id}/cancel`
            ),
            onSuccess: (updated) => {
                void queryClient.invalidateQueries({ 
                    queryKey: projectSealKeys.lists() 
                });
                void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
                void queryClient.setQueryData(
                    projectSealKeys.detail(id),
                    updated
                );
            },
    });
}


export function useIssueProjectSeal(id: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (file?: File) =>{
            if(file){
                const formData = new FormData();
                formData.append('file', file);
                return apiPostForm<ProjectSealDetail>(
                    `${PROJECT_SEAL_PATH}/${id}/seal`,
                    formData,
                );
            }
            return apiPost<ProjectSealDetail>(
                `${PROJECT_SEAL_PATH}/${id}/issue`,
            )
        },
        onSuccess: (updated) => {
            void queryClient.invalidateQueries({
                queryKey: projectSealKeys.lists(),
            });
            void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
            void queryClient.setQueryData(
                projectSealKeys.detail(id),
                updated,
            );
        },
    })
}