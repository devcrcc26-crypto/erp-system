import { toQueryString } from "./pm-query-utils";
import { ListProjectSealsParams, ProjectSealDetail, ProjectSealListItem, SubmitProjectSealPayload } from "../api/project-seal.types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PaginatedResult } from "../api/types";
import { apiClient, apiGet, apiGetPaginated, apiPatch, apiPost, apiPostForm } from "../api/client";
import { appendSealSubmitFields, sealSubmitJsonFields } from "../utils/seal-submit-fields";
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

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for the project seal list (filter locally).
 */
async function fetchAllProjectSealPages(
  params: Omit<ListProjectSealsParams, 'page' | 'limit' | 'search'> = {},
): Promise<ProjectSealListItem[]> {
  const first = await apiGetPaginated<ProjectSealListItem>(
    `${PROJECT_SEAL_PATH}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<ProjectSealListItem>(
        `${PROJECT_SEAL_PATH}${buildListQuery({
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

/** All project seals (all pages) for client-side filter/search. */
export function useProjectSealsAll(
  params: Omit<ListProjectSealsParams, 'page' | 'limit' | 'search'> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...projectSealKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllProjectSealPages(params),
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
                formData.append('fileName', payload.fileName);
                formData.append('description', payload.description);
                formData.append('urgency', payload.urgency);
                formData.append('dateNeeded', payload.dateNeeded);
                appendSealSubmitFields(formData, payload);
                for (const file of payload.files ?? []) {
                    formData.append('files', file);
                }
                return apiPostForm<ProjectSealDetail>(PROJECT_SEAL_PATH, formData);
        }
        return apiPost<ProjectSealDetail>(
            PROJECT_SEAL_PATH, 
            {
            fileName: payload.fileName,
            description: payload.description,
            urgency: payload.urgency,
            dateNeeded: payload.dateNeeded,
            ...sealSubmitJsonFields(payload),
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
export async function openProjectSealPdf(id: string): Promise<void> {
  const response = await apiClient.get(`${PROJECT_SEAL_PATH}/${id}/pdf`, { responseType: 'blob' });
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
