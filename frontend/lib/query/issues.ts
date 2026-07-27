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
  CloseIssueRequest,
  CreateIssueRequest,
  CreateIssueResponseRequest,
  Issue,
  IssueProjectOption,
  IssueResponse,
  IssueSeverity,
  IssueStatus,
  PmListFilters,
  ReopenIssueRequest,
  UpdateIssueRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const issuesPath = (projectId: string): string =>
  projectPath(projectId, 'issues');

export const issueKeys = {
  all: ['pm', 'issues'] as const,
  lists: (projectId: string) => [...issueKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams &
      PmListFilters & { status?: string; severity?: IssueSeverity } = {
      page: 1,
      limit: 20,
    },
  ) => [...issueKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...issueKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, issueId: string) =>
    [...issueKeys.details(projectId), issueId] as const,
  responses: (projectId: string, issueId: string) =>
    [...issueKeys.detail(projectId, issueId), 'responses'] as const,
  myList: (
    params: PaginationParams &
      PmListFilters & { status?: string; severity?: IssueSeverity } = {
      page: 1,
      limit: 20,
    },
  ) => [...issueKeys.all, 'my', params] as const,
  allList: (
    params: PaginationParams &
      PmListFilters & { status?: string; severity?: IssueSeverity } = {
      page: 1,
      limit: 20,
    },
  ) => [...issueKeys.all, 'all', params] as const,
  myProjects: () => [...issueKeys.all, 'my', 'projects'] as const,
};

export function useIssues(
  projectId: string,
  params: PaginationParams &
    PmListFilters & { status?: string; severity?: IssueSeverity } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Issue>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: issueKeys.list(projectId, params),
    queryFn: () =>
      apiGetPaginated<Issue>(
        `${issuesPath(projectId)}${toQueryString(params)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useIssue(projectId: string, issueId: string, enabled = true) {
  return useQuery({
    queryKey: issueKeys.detail(projectId, issueId),
    queryFn: () => apiGet<Issue>(`${issuesPath(projectId)}/${issueId}`),
    enabled: Boolean(projectId) && Boolean(issueId) && enabled,
    retry: false,
  });
}

export function useIssueResponses(
  projectId: string,
  issueId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: issueKeys.responses(projectId, issueId),
    queryFn: () =>
      apiGet<IssueResponse[]>(
        `${issuesPath(projectId)}/${issueId}/responses`,
      ),
    enabled: Boolean(projectId) && Boolean(issueId) && enabled,
    retry: false,
  });
}

export function useCreateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateIssueRequest;
    }) => apiPost<Issue>(issuesPath(projectId), body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: issueKeys.lists(variables.projectId),
      });
    },
  });
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      issueId,
      body,
    }: {
      projectId: string;
      issueId: string;
      body: UpdateIssueRequest;
    }) => apiPatch<Issue>(`${issuesPath(projectId)}/${issueId}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: issueKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: issueKeys.detail(variables.projectId, variables.issueId),
      });
    },
  });
}

function invalidateIssueQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  issueId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: issueKeys.lists(projectId) });
  void queryClient.invalidateQueries({
    queryKey: issueKeys.detail(projectId, issueId),
  });
  void queryClient.invalidateQueries({
    queryKey: issueKeys.responses(projectId, issueId),
  });
  void queryClient.invalidateQueries({ queryKey: issueKeys.all });
}

export function useCloseIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      issueId,
      body,
    }: {
      projectId: string;
      issueId: string;
      body: CloseIssueRequest;
    }) =>
      apiPatch<Issue>(`${issuesPath(projectId)}/${issueId}/close`, body),
    onSuccess: (_data, variables) => {
      invalidateIssueQueries(
        queryClient,
        variables.projectId,
        variables.issueId,
      );
    },
  });
}

export function useReopenIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      issueId,
      body,
    }: {
      projectId: string;
      issueId: string;
      body: ReopenIssueRequest;
    }) =>
      apiPatch<Issue>(
        `${issuesPath(projectId)}/${issueId}/reopen`,
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidateIssueQueries(
        queryClient,
        variables.projectId,
        variables.issueId,
      );
    },
  });
}

/**
 * Links a change request to an issue.
 */
export function useLinkIssueCr() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      issueId,
      crId,
    }: {
      projectId: string;
      issueId: string;
      crId: string;
    }) =>
      apiPatch<Issue>(
        `${issuesPath(projectId)}/${issueId}/link-cr`,
        { crId },
      ),
    onSuccess: (_data, variables) => {
      invalidateIssueQueries(
        queryClient,
        variables.projectId,
        variables.issueId,
      );
    },
  });
}

export function useAddIssueResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      issueId,
      body,
    }: {
      projectId: string;
      issueId: string;
      body: CreateIssueResponseRequest;
    }) =>
      apiPost<IssueResponse>(
        `${issuesPath(projectId)}/${issueId}/responses`,
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidateIssueQueries(
        queryClient,
        variables.projectId,
        variables.issueId,
      );
    },
  });
}

export function useDeleteIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      issueId,
    }: {
      projectId: string;
      issueId: string;
    }) => apiDelete<MessageResponse>(`${issuesPath(projectId)}/${issueId}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: issueKeys.lists(variables.projectId),
      });
    },
  });
}

/**
 * Cross-project issues relevant to the signed-in user.
 */
export function useMyIssues(
  params: PaginationParams &
    PmListFilters & {
      status?: string;
      severity?: IssueSeverity;
    } = {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Issue>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: issueKeys.myList(params),
    queryFn: () =>
      apiGetPaginated<Issue>(`/issues/my${toQueryString(params)}`),
    enabled,
    retry: false,
    ...options,
  });
}

/**
 * Company-wide issues (portfolio / admin users).
 */
export function useAllIssues(
  params: PaginationParams &
    PmListFilters & {
      status?: string;
      severity?: IssueSeverity;
    } = {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Issue>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: issueKeys.allList(params),
    queryFn: () =>
      apiGetPaginated<Issue>(`/issues/all${toQueryString(params)}`),
    enabled,
    retry: false,
    ...options,
  });
}

/**
 * Projects that have issues relevant to the current user.
 */
export function useMyIssueProjects(enabled = true) {
  return useQuery({
    queryKey: issueKeys.myProjects(),
    queryFn: () => apiGet<IssueProjectOption[]>('/issues/my/projects'),
    enabled,
    retry: false,
  });
}
