'use client';

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import {
  useCanViewReviewInbox,
  useCapabilitiesReady,
} from '@/hooks/use-pm-capabilities';
import type {
  DispatcherWorkloadItem,
  MyCommentItem,
  ProjectStatusBoard,
  ReviewInboxItem,
  ReviewModeView,
  VersionHistoryEntry,
} from '@/lib/api/epc.types';
import { projectPath } from '@/lib/query/pm-query-utils';

export const epcWorkspaceKeys = {
  all: ['epc', 'workspace'] as const,
  reviewInbox: () => [...epcWorkspaceKeys.all, 'review-inbox'] as const,
  myComments: () => [...epcWorkspaceKeys.all, 'my-comments'] as const,
  statusBoard: (projectId: string) =>
    [...epcWorkspaceKeys.all, 'status-board', projectId] as const,
  workload: (projectId: string) =>
    [...epcWorkspaceKeys.all, 'workload', projectId] as const,
  reviewMode: (designPackageId: string) =>
    [...epcWorkspaceKeys.all, 'review-mode', designPackageId] as const,
  versionHistory: (engineeringDocumentId: string) =>
    [...epcWorkspaceKeys.all, 'version-history', engineeringDocumentId] as const,
};

export function useReviewInbox(
  enabled = true,
  options?: Omit<UseQueryOptions<ReviewInboxItem[]>, 'queryKey' | 'queryFn'>,
) {
  const capabilitiesReady = useCapabilitiesReady();
  const canViewReviewInbox = useCanViewReviewInbox();

  return useQuery({
    queryKey: epcWorkspaceKeys.reviewInbox(),
    queryFn: () => apiGet<ReviewInboxItem[]>('/review-inbox'),
    enabled: enabled && capabilitiesReady && canViewReviewInbox,
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    ...options,
  });
}

export function useMyComments(
  enabled = true,
  options?: Omit<UseQueryOptions<MyCommentItem[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: epcWorkspaceKeys.myComments(),
    queryFn: () => apiGet<MyCommentItem[]>('/my-comments'),
    enabled,
    retry: false,
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

export function useDesignPackageReviewMode(
  designPackageId: string,
  enabled = true,
  options?: Omit<UseQueryOptions<ReviewModeView>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: epcWorkspaceKeys.reviewMode(designPackageId),
    queryFn: () =>
      apiGet<ReviewModeView>(`/design-packages/${designPackageId}/review-mode`),
    enabled: Boolean(designPackageId) && enabled,
    retry: false,
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
