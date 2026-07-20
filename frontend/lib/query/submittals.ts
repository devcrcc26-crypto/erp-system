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
  SubmittalReview,
  SubmittalStatus,
  UpdateSubmittalRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const submittalsPath = (projectId: string): string =>
  projectPath(projectId, 'submittals');

export const submittalKeys = {
  all: ['pm', 'submittals'] as const,
  myLists: () => [...submittalKeys.all, 'my', 'list'] as const,
  myList: (
    params: PaginationParams & PmListFilters & { status?: SubmittalStatus } = {
      page: 1,
      limit: 20,
    },
  ) => [...submittalKeys.myLists(), params] as const,
  lists: (projectId: string) =>
    [...submittalKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams & PmListFilters & { status?: SubmittalStatus } = {
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
};

/**
 * Cross-project construction submittals relevant to the signed-in user.
 */
export function useMySubmittals(
  params: PaginationParams & PmListFilters & { status?: SubmittalStatus } = {
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

export function useSubmittals(
  projectId: string,
  params: PaginationParams & PmListFilters & { status?: SubmittalStatus } = {
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
