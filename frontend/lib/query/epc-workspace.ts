'use client';

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiGet, apiGetPaginated } from '@/lib/api/client';
import {
  useCanViewMyComments,
  useCanViewMyWork,
  useCanViewReviewInbox,
  useCapabilitiesReady,
} from '@/hooks/use-pm-capabilities';
import type {
  DispatcherWorkloadItem,
  MyCommentItem,
  MyWorkItem,
  ProjectStatusBoard,
  ReviewInboxItem,
  ReviewModeView,
  VersionHistoryEntry,
} from '@/lib/api/epc.types';
import type {
  ReviewSessionStatus,
  ReviewSessionSummary,
} from '@/lib/api/project-management.types';
import type { PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

export const epcWorkspaceKeys = {
  all: ['epc', 'workspace'] as const,
  reviewInbox: (projectId?: string) =>
    [...epcWorkspaceKeys.all, 'review-inbox', projectId ?? 'global'] as const,
  myComments: (projectId?: string) =>
    [...epcWorkspaceKeys.all, 'my-comments', projectId ?? 'global'] as const,
  myWork: (projectId?: string) =>
    [...epcWorkspaceKeys.all, 'my-work', projectId ?? 'global'] as const,
  statusBoard: (projectId: string) =>
    [...epcWorkspaceKeys.all, 'status-board', projectId] as const,
  workload: (projectId: string) =>
    [...epcWorkspaceKeys.all, 'workload', projectId] as const,
  reviewSessions: (projectId: string) =>
    [...epcWorkspaceKeys.all, 'review-sessions', projectId] as const,
  disciplineReviewSessions: (
    projectId: string,
    taskDisciplineId: string,
  ) =>
    [
      ...epcWorkspaceKeys.all,
      'discipline-review-sessions',
      projectId,
      taskDisciplineId,
    ] as const,
  reviewMode: (designPackageId: string, reviewSessionId?: string | null) =>
    [
      ...epcWorkspaceKeys.all,
      'review-mode',
      designPackageId,
      reviewSessionId ?? null,
    ] as const,
  versionHistory: (engineeringDocumentId: string) =>
    [...epcWorkspaceKeys.all, 'version-history', engineeringDocumentId] as const,
};

export function useReviewInbox(
  projectId?: string,
  enabled = true,
  options?: Omit<UseQueryOptions<ReviewInboxItem[]>, 'queryKey' | 'queryFn'>,
) {
  const capabilitiesReady = useCapabilitiesReady();
  const canViewReviewInbox = useCanViewReviewInbox();

  return useQuery({
    queryKey: epcWorkspaceKeys.reviewInbox(projectId),
    queryFn: () =>
      projectId
        ? apiGet<ReviewInboxItem[]>(
            `${projectPath(projectId)}/review-inbox`,
          )
        : apiGet<ReviewInboxItem[]>('/review-inbox'),
    enabled: enabled && capabilitiesReady && canViewReviewInbox,
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    ...options,
  });
}

export function useMyComments(
  projectId?: string,
  enabled = true,
  options?: Omit<UseQueryOptions<MyCommentItem[]>, 'queryKey' | 'queryFn'>,
) {
  const capabilitiesReady = useCapabilitiesReady();
  const canViewMyComments = useCanViewMyComments();

  return useQuery({
    queryKey: epcWorkspaceKeys.myComments(projectId),
    queryFn: () =>
      projectId
        ? apiGet<MyCommentItem[]>(`${projectPath(projectId)}/my-comments`)
        : apiGet<MyCommentItem[]>('/my-comments'),
    enabled: enabled && capabilitiesReady && canViewMyComments,
    retry: false,
    ...options,
  });
}

export function useMyWork(
  projectId?: string,
  enabled = true,
  options?: Omit<UseQueryOptions<MyWorkItem[]>, 'queryKey' | 'queryFn'>,
) {
  const capabilitiesReady = useCapabilitiesReady();
  const canViewMyWork = useCanViewMyWork();

  return useQuery({
    queryKey: epcWorkspaceKeys.myWork(projectId),
    queryFn: () =>
      projectId
        ? apiGet<MyWorkItem[]>(`${projectPath(projectId)}/my-work`)
        : apiGet<MyWorkItem[]>('/my-work'),
    enabled: enabled && capabilitiesReady && canViewMyWork,
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    ...options,
  });
}

export function useProjectStatusBoard(
  projectId: string,
  enabled = true,
  options?: Omit<UseQueryOptions<ProjectStatusBoard>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: epcWorkspaceKeys.statusBoard(projectId),
    queryFn: () =>
      apiGet<ProjectStatusBoard>(`${projectPath(projectId)}/status-board`),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useProjectWorkload(
  projectId: string,
  enabled = true,
  options?: Omit<
    UseQueryOptions<DispatcherWorkloadItem[]>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: epcWorkspaceKeys.workload(projectId),
    queryFn: () =>
      apiGet<DispatcherWorkloadItem[]>(`${projectPath(projectId)}/workload`),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

/** Alias for dispatcher workload panel (GAP 15). */
export const useDispatcherWorkload = useProjectWorkload;

export function useProjectReviewSessions(
  projectId: string,
  status: ReviewSessionStatus = 'ACTIVE',
  params: PaginationParams = { page: 1, limit: 50 },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<ReviewSessionSummary>>,
    'queryKey' | 'queryFn'
  >,
) {
  const queryParams = { ...params, status };

  return useQuery({
    queryKey: [...epcWorkspaceKeys.reviewSessions(projectId), queryParams],
    queryFn: () =>
      apiGetPaginated<ReviewSessionSummary>(
        `${projectPath(projectId)}/review-sessions${toQueryString(queryParams)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useDisciplineReviewSessions(
  projectId: string,
  taskDisciplineId: string,
  status: ReviewSessionStatus = 'ACTIVE',
  params: PaginationParams = { page: 1, limit: 50 },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<ReviewSessionSummary>>,
    'queryKey' | 'queryFn'
  >,
) {
  const queryParams = { ...params, status };

  return useQuery({
    queryKey: [
      ...epcWorkspaceKeys.disciplineReviewSessions(projectId, taskDisciplineId),
      queryParams,
    ],
    queryFn: () =>
      apiGetPaginated<ReviewSessionSummary>(
        `${projectPath(projectId)}/task-disciplines/${taskDisciplineId}/design-packages/review-sessions${toQueryString(queryParams)}`,
      ),
    enabled:
      Boolean(projectId) && Boolean(taskDisciplineId) && enabled,
    retry: false,
    ...options,
  });
}

export function useDesignPackageReviewMode(
  designPackageId: string,
  enabled = true,
  reviewSessionId?: string | null,
  options?: Omit<UseQueryOptions<ReviewModeView>, 'queryKey' | 'queryFn'>,
) {
  const capabilitiesReady = useCapabilitiesReady();

  return useQuery({
    queryKey: epcWorkspaceKeys.reviewMode(designPackageId, reviewSessionId),
    queryFn: () =>
      apiGet<ReviewModeView>(
        `/design-packages/${designPackageId}/review-mode${
          reviewSessionId
            ? `?reviewSessionId=${encodeURIComponent(reviewSessionId)}`
            : ''
        }`,
      ),
    enabled: Boolean(designPackageId) && enabled && capabilitiesReady,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    ...options,
  });
}

export function useEngineeringDocumentVersionHistory(
  engineeringDocumentId: string,
  enabled = true,
  options?: Omit<UseQueryOptions<VersionHistoryEntry[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: epcWorkspaceKeys.versionHistory(engineeringDocumentId),
    queryFn: () =>
      apiGet<VersionHistoryEntry[]>(
        `/engineering-documents/${engineeringDocumentId}/version-history`,
      ),
    enabled: Boolean(engineeringDocumentId) && enabled,
    retry: false,
    ...options,
  });
}
