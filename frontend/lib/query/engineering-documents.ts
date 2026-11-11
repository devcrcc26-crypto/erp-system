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
  BatchLockPackagesRequest,
  DecisionTraceView,
  EngineeringDocument,
  EngineeringDocumentVersion,
  RegisterEngineeringDocumentRequest,
  ReplaceDraftVersionFileRequest,
  TransitionEdvStatusRequest,
  TriggerRevisionRequest,
  UpdateEngineeringDocumentRequest,
  UpdateEngineeringDocumentVersionRequest,
  UploadEngineeringDocumentVersionRequest,
  WorkflowEventLogEntry,
  WorkflowResultSnapshot,
} from '@/lib/api/epc.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { engineeringDocumentsPath } from '@/lib/query/epc-query-utils';
import { epcWorkspaceKeys } from '@/lib/query/epc-workspace';
import { designPackageKeys } from '@/lib/query/design-packages';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

export const engineeringDocumentKeys = {
  all: ['epc', 'engineering-documents'] as const,
  lists: (projectId: string, taskDisciplineId: string) =>
    [
      ...engineeringDocumentKeys.all,
      projectId,
      taskDisciplineId,
      'list',
    ] as const,
  list: (
    projectId: string,
    taskDisciplineId: string,
    params: PaginationParams = { page: 1, limit: 20 },
  ) =>
    [...engineeringDocumentKeys.lists(projectId, taskDisciplineId), params] as const,
  details: (projectId: string, taskDisciplineId: string) =>
    [
      ...engineeringDocumentKeys.all,
      projectId,
      taskDisciplineId,
      'detail',
    ] as const,
  detail: (
    projectId: string,
    taskDisciplineId: string,
    engineeringDocumentId: string,
  ) =>
    [
      ...engineeringDocumentKeys.details(projectId, taskDisciplineId),
      engineeringDocumentId,
    ] as const,
  events: (
    projectId: string,
    taskDisciplineId: string,
    engineeringDocumentId: string,
    versionId: string,
  ) =>
    [
      ...engineeringDocumentKeys.detail(
        projectId,
        taskDisciplineId,
        engineeringDocumentId,
      ),
      'versions',
      versionId,
      'events',
    ] as const,
  decisionTrace: (projectId: string, engineeringDocumentId: string) =>
    [
      ...engineeringDocumentKeys.all,
      projectId,
      engineeringDocumentId,
      'decision-trace',
    ] as const,
  uploadFolder: (projectId: string, taskDisciplineId: string) =>
    [
      ...engineeringDocumentKeys.lists(projectId, taskDisciplineId),
      'upload-folder',
    ] as const,
};

export interface DisciplineUploadFolder {
  id: string;
  path: string;
}

export function useDisciplineUploadFolder(
  projectId: string,
  taskDisciplineId: string,
  enabled = true,
) {
  const base = engineeringDocumentsPath(projectId, taskDisciplineId);
  return useQuery({
    queryKey: engineeringDocumentKeys.uploadFolder(projectId, taskDisciplineId),
    queryFn: () => apiGet<DisciplineUploadFolder>(`${base}/upload-folder`),
    enabled: Boolean(projectId) && Boolean(taskDisciplineId) && enabled,
    retry: false,
    staleTime: 60_000,
  });
}

export function useEngineeringDocuments(
  projectId: string,
  taskDisciplineId: string,
  params: PaginationParams = { page: 1, limit: 20 },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<EngineeringDocument>>,
    'queryKey' | 'queryFn'
  >,
) {
  const base = engineeringDocumentsPath(projectId, taskDisciplineId);
  return useQuery({
    queryKey: engineeringDocumentKeys.list(projectId, taskDisciplineId, params),
    queryFn: () =>
      apiGetPaginated<EngineeringDocument>(`${base}${toQueryString(params)}`),
    enabled: Boolean(projectId) && Boolean(taskDisciplineId) && enabled,
    retry: false,
    ...options,
  });
}

export function useEngineeringDocument(
  projectId: string,
  taskDisciplineId: string,
  engineeringDocumentId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: engineeringDocumentKeys.detail(
      projectId,
      taskDisciplineId,
      engineeringDocumentId,
    ),
    queryFn: () =>
      apiGet<EngineeringDocument>(
        engineeringDocumentsPath(
          projectId,
          taskDisciplineId,
          engineeringDocumentId,
        ),
      ),
    enabled:
      Boolean(projectId) &&
      Boolean(taskDisciplineId) &&
      Boolean(engineeringDocumentId) &&
      enabled,
    retry: false,
  });
}

export function useEdvWorkflowEvents(
  projectId: string,
  taskDisciplineId: string,
  engineeringDocumentId: string,
  versionId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: engineeringDocumentKeys.events(
      projectId,
      taskDisciplineId,
      engineeringDocumentId,
      versionId,
    ),
    queryFn: () =>
      apiGet<WorkflowEventLogEntry[]>(
        engineeringDocumentsPath(
          projectId,
          taskDisciplineId,
          engineeringDocumentId,
          `versions/${versionId}/events`,
        ),
      ),
    enabled:
      Boolean(projectId) &&
      Boolean(taskDisciplineId) &&
      Boolean(engineeringDocumentId) &&
      Boolean(versionId) &&
      enabled,
    retry: false,
  });
}

export function useDecisionTrace(
  projectId: string,
  engineeringDocumentId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: engineeringDocumentKeys.decisionTrace(
      projectId,
      engineeringDocumentId,
    ),
    queryFn: () =>
      apiGet<DecisionTraceView>(
        `${projectPath(projectId)}/engineering-documents/${engineeringDocumentId}/decision-trace`,
      ),
    enabled: Boolean(projectId) && Boolean(engineeringDocumentId) && enabled,
    retry: false,
  });
}

export function useRegisterEngineeringDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      body,
    }: {
      projectId: string;
      taskDisciplineId: string;
      body: RegisterEngineeringDocumentRequest;
    }) =>
      apiPost<EngineeringDocument>(
        `${engineeringDocumentsPath(projectId, taskDisciplineId)}/register`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.lists(
          variables.projectId,
          variables.taskDisciplineId,
        ),
      });
    },
  });
}

export function useUpdateEngineeringDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      engineeringDocumentId,
      body,
    }: {
      projectId: string;
      taskDisciplineId: string;
      engineeringDocumentId: string;
      body: UpdateEngineeringDocumentRequest;
    }) =>
      apiPatch<EngineeringDocument>(
        engineeringDocumentsPath(
          projectId,
          taskDisciplineId,
          engineeringDocumentId,
        ),
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.detail(
          variables.projectId,
          variables.taskDisciplineId,
          variables.engineeringDocumentId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.lists(
          variables.projectId,
          variables.taskDisciplineId,
        ),
      });
    },
  });
}

export function useDeleteEngineeringDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      engineeringDocumentId,
    }: {
      projectId: string;
      taskDisciplineId: string;
      engineeringDocumentId: string;
    }) =>
      apiDelete<MessageResponse>(
        engineeringDocumentsPath(
          projectId,
          taskDisciplineId,
          engineeringDocumentId,
        ),
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.lists(
          variables.projectId,
          variables.taskDisciplineId,
        ),
      });
    },
  });
}

export function useUploadEngineeringDocumentVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      engineeringDocumentId,
      body,
    }: {
      projectId: string;
      taskDisciplineId: string;
      engineeringDocumentId: string;
      body: UploadEngineeringDocumentVersionRequest;
    }) =>
      apiPost<EngineeringDocument>(
        engineeringDocumentsPath(
          projectId,
          taskDisciplineId,
          engineeringDocumentId,
          'versions',
        ),
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.detail(
          variables.projectId,
          variables.taskDisciplineId,
          variables.engineeringDocumentId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.lists(
          variables.projectId,
          variables.taskDisciplineId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.versionHistory(variables.engineeringDocumentId),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: designPackageKeys.all,
      });
    },
  });
}

export function useUpdateEngineeringDocumentVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      engineeringDocumentId,
      versionId,
      body,
    }: {
      projectId: string;
      taskDisciplineId: string;
      engineeringDocumentId: string;
      versionId: string;
      body: UpdateEngineeringDocumentVersionRequest;
    }) =>
      apiPatch<EngineeringDocument>(
        engineeringDocumentsPath(
          projectId,
          taskDisciplineId,
          engineeringDocumentId,
          `versions/${versionId}`,
        ),
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.detail(
          variables.projectId,
          variables.taskDisciplineId,
          variables.engineeringDocumentId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.lists(
          variables.projectId,
          variables.taskDisciplineId,
        ),
      });
    },
  });
}

export function useTransitionEdvStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      engineeringDocumentId,
      versionId,
      body,
    }: {
      projectId: string;
      taskDisciplineId: string;
      engineeringDocumentId: string;
      versionId: string;
      body: TransitionEdvStatusRequest;
    }) =>
      apiPost<WorkflowResultSnapshot>(
        engineeringDocumentsPath(
          projectId,
          taskDisciplineId,
          engineeringDocumentId,
          `versions/${versionId}/transition`,
        ),
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.detail(
          variables.projectId,
          variables.taskDisciplineId,
          variables.engineeringDocumentId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.lists(
          variables.projectId,
          variables.taskDisciplineId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.versionHistory(variables.engineeringDocumentId),
      });
      void queryClient.invalidateQueries({
        queryKey: designPackageKeys.all,
      });
    },
  });
}

export function useBatchLockEngineeringDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: BatchLockPackagesRequest;
    }) =>
      apiPost<WorkflowResultSnapshot>(
        `${projectPath(projectId)}/engineering-documents/batch-lock`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['epc', 'design-packages', variables.projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.statusBoard(variables.projectId),
      });
    },
  });
}

export function useTriggerRevision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      engineeringDocumentId,
      body,
    }: {
      projectId: string;
      engineeringDocumentId: string;
      body: TriggerRevisionRequest;
    }) =>
      apiPost<WorkflowResultSnapshot>(
        `${projectPath(projectId)}/engineering-documents/${engineeringDocumentId}/trigger-revision`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.decisionTrace(
          variables.projectId,
          variables.engineeringDocumentId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.versionHistory(variables.engineeringDocumentId),
      });
      void queryClient.invalidateQueries({
        queryKey: [...engineeringDocumentKeys.all, variables.projectId],
      });
    },
  });
}

export function useReplaceDraftVersionFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      engineeringDocumentId,
      versionId,
      body,
    }: {
      projectId: string;
      engineeringDocumentId: string;
      versionId: string;
      body: ReplaceDraftVersionFileRequest;
    }) =>
      apiPatch<EngineeringDocumentVersion>(
        `${projectPath(projectId)}/engineering-documents/${engineeringDocumentId}/versions/${versionId}/replace-draft-file`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.versionHistory(variables.engineeringDocumentId),
      });
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.decisionTrace(
          variables.projectId,
          variables.engineeringDocumentId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: [...engineeringDocumentKeys.all, variables.projectId],
      });
    },
  });
}

export function useProcessRevisionTrigger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      triggerId,
    }: {
      projectId: string;
      triggerId: string;
    }) =>
      apiPost<WorkflowResultSnapshot[]>(
        `${projectPath(projectId)}/revision-triggers/${triggerId}/process`,
        {},
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['epc', 'engineering-documents', variables.projectId],
      });
    },
  });
}
