'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  apiDelete,
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
} from '@/lib/api/client';
import type {
  CreateConstructionSubmittalRequest,
  CreateSubmittalRequest,
  CreateSubmittalReviewRequest,
  PmListFilters,
  Submittal,
  SubmittalDetail,
  SubmittalItemReleasableEdv,
  SubmittalReview,
  SubmittalStatus,
  UpdateSubmittalRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

export function submittalsPath(projectId: string): string {
  return projectPath(projectId, 'submittals');
}

export const submittalKeys = {
  all: ['pm', 'submittals'] as const,
  myLists: () => [...submittalKeys.all, 'my', 'list'] as const,
  myList: (
    params: PaginationParams & PmListFilters & { status?: string } = {
      page: 1,
      limit: 20,
    },
  ) => [...submittalKeys.myLists(), params] as const,
  allLists: () => [...submittalKeys.all, 'all', 'list'] as const,
  allList: (
    params: PaginationParams & PmListFilters & { status?: string } = {
      page: 1,
      limit: 20,
    },
  ) => [...submittalKeys.allLists(), params] as const,
  externalAllLists: () => [...submittalKeys.all, 'external-all', 'list'] as const,
  externalAllList: (
    params: PaginationParams & PmListFilters & { status?: string } = {
      page: 1,
      limit: 20,
    },
  ) => [...submittalKeys.externalAllLists(), params] as const,
  lists: (projectId: string) =>
    [...submittalKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams & PmListFilters & { status?: string } = {
      page: 1,
      limit: 20,
    },
  ) => [...submittalKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...submittalKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, submittalId: string) =>
    [...submittalKeys.details(projectId), submittalId] as const,
  reviews: (projectId: string, submittalId: string) =>
    [...submittalKeys.detail(projectId, submittalId), 'reviews'] as const,
  itemEdvs: (projectId: string, submittalId: string, itemId: string) =>
    [
      ...submittalKeys.detail(projectId, submittalId),
      'items',
      itemId,
      'edvs',
    ] as const,
};

/**
 * Cross-project construction submittals relevant to the signed-in user.
 */
export function useMySubmittals(
  params: PaginationParams & PmListFilters & { status?: string } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Submittal>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: submittalKeys.myList(params),
    queryFn: () =>
      apiGetPaginated<Submittal>(`/submittals/my${toQueryString(params)}`),
    enabled,
    retry: false,
    ...options,
  });
}

/**
 * Company-wide construction submittals (portfolio / admin users).
 */
export function useAllSubmittals(
  params: PaginationParams & PmListFilters & { status?: string } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Submittal>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: submittalKeys.allList(params),
    queryFn: () =>
      apiGetPaginated<Submittal>(`/submittals/all${toQueryString(params)}`),
    enabled,
    retry: false,
    ...options,
  });
}

/**
 * Company-wide external releases (portfolio / admin users).
 */
export function useAllExternalReleases(
  params: PaginationParams & PmListFilters & { status?: string } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Submittal>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: submittalKeys.externalAllList(params),
    queryFn: () =>
      apiGetPaginated<Submittal>(
        `/external-releases/all${toQueryString(params)}`,
      ),
    enabled,
    retry: false,
    ...options,
  });
}

export function useSubmittals(
  projectId: string,
  params: PaginationParams & PmListFilters & { status?: string } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Submittal>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: submittalKeys.list(projectId, params),
    queryFn: () =>
      apiGetPaginated<Submittal>(
        `${submittalsPath(projectId)}${toQueryString(params)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useSubmittal(
  projectId: string,
  submittalId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: submittalKeys.detail(projectId, submittalId),
    queryFn: () =>
      apiGet<SubmittalDetail>(`${submittalsPath(projectId)}/${submittalId}`),
    enabled: Boolean(projectId) && Boolean(submittalId) && enabled,
    retry: false,
  });
}

export function useSubmittalReviews(
  projectId: string,
  submittalId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: submittalKeys.reviews(projectId, submittalId),
    queryFn: () =>
      apiGet<SubmittalReview[]>(
        `${submittalsPath(projectId)}/${submittalId}/reviews`,
      ),
    enabled: Boolean(projectId) && Boolean(submittalId) && enabled,
    retry: false,
  });
}

export function useCreateSubmittal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateSubmittalRequest;
    }) => apiPost<Submittal>(submittalsPath(projectId), body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.lists(variables.projectId),
      });
    },
  });
}

export function useCreateConstructionSubmittal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateConstructionSubmittalRequest;
    }) =>
      apiPost<SubmittalDetail>(`${submittalsPath(projectId)}/construction`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.lists(variables.projectId),
      });
    },
  });
}

export function useSubmitSubmittalToLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
    }: {
      projectId: string;
      submittalId: string;
    }) =>
      apiPost<Submittal>(
        `${submittalsPath(projectId)}/${submittalId}/submit-to-lead`,
        {},
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.detail(variables.projectId, variables.submittalId),
      });
    },
  });
}

export function useUpdateSubmittal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      body,
    }: {
      projectId: string;
      submittalId: string;
      body: UpdateSubmittalRequest;
    }) =>
      apiPatch<Submittal>(
        `${submittalsPath(projectId)}/${submittalId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.detail(
          variables.projectId,
          variables.submittalId,
        ),
      });
    },
  });
}

export function useDeleteSubmittal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
    }: {
      projectId: string;
      submittalId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${submittalsPath(projectId)}/${submittalId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.lists(variables.projectId),
      });
    },
  });
}

export function useAddSubmittalReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      body,
    }: {
      projectId: string;
      submittalId: string;
      body: CreateSubmittalReviewRequest;
    }) =>
      apiPost<SubmittalReview>(
        `${submittalsPath(projectId)}/${submittalId}/reviews`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.reviews(variables.projectId, variables.submittalId),
      });
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.detail(variables.projectId, variables.submittalId),
      });
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.lists(variables.projectId),
      });
    },
  });
}

export function useSubmittalItemEdvs(
  projectId: string,
  submittalId: string,
  itemId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: submittalKeys.itemEdvs(projectId, submittalId, itemId),
    queryFn: () =>
      apiGet<SubmittalItemReleasableEdv[]>(
        `${submittalsPath(projectId)}/${submittalId}/items/${itemId}/edvs`,
      ),
    enabled: Boolean(projectId && submittalId && itemId) && enabled,
    retry: false,
  });
}

export function useExcludeSubmittalItemEdv() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      itemId,
      edvId,
    }: {
      projectId: string;
      submittalId: string;
      itemId: string;
      edvId: string;
    }) =>
      apiDelete(
        `${submittalsPath(projectId)}/${submittalId}/items/${itemId}/edvs/${edvId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.detail(variables.projectId, variables.submittalId),
      });
    },
  });
}

export function useIncludeSubmittalItemEdv() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      itemId,
      edvId,
    }: {
      projectId: string;
      submittalId: string;
      itemId: string;
      edvId: string;
    }) =>
      apiPost(
        `${submittalsPath(projectId)}/${submittalId}/items/${itemId}/edvs/${edvId}/include`,
        {},
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.detail(variables.projectId, variables.submittalId),
      });
    },
  });
}

export async function fetchEdvDownloadUrl(
  projectId: string,
  edvId: string,
): Promise<{ url: string; fileName: string; fileSizeBytes: number }> {
  return apiGet<{ url: string; fileName: string; fileSizeBytes: number }>(
    `${projectPath(projectId)}/engineering-documents/versions/${edvId}/download-url`,
  );
}
