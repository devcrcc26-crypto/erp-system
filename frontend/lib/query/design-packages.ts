'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import type {
  AddDesignPackageItemRequest,
  ApproveReviewSessionRequest,
  BatchApproveEdvsRequest,
  CreateDesignPackageDependencyRequest,
  CreateDesignPackageRequest,
  DesignPackage,
  DesignPackageDependency,
  DesignPackageItem,
  LockPackageEdvsRequest,
  ReturnPackageForReworkRequest,
  ReviewContextSnapshot,
  SubmitPackageForReviewRequest,
  UpdateDesignPackageRequest,
  WorkflowResultSnapshot,
} from '@/lib/api/epc.types';
import type {
  AddReviewSessionAttachmentRequest,
  ConfigureRevisionTriggerRequest,
  ExternalReviewTrigger,
  ReviewSessionAttachment,
  TaskDiscipline,
} from '@/lib/api/project-management.types';
import type { MessageResponse } from '@/lib/api/types';
import { designPackagesPath, PROJECTION_POLL_MS } from '@/lib/query/epc-query-utils';
import { epcWorkspaceKeys } from '@/lib/query/epc-workspace';
import { disciplineKeys } from '@/lib/query/disciplines';
import { engineeringDocumentKeys } from '@/lib/query/engineering-documents';
import { projectPath } from '@/lib/query/pm-query-utils';
import { scheduleKeys } from '@/lib/query/schedule';

function scheduleBase(projectId: string): string {
  return `${projectPath(projectId)}/schedule`;
}

export const designPackageKeys = {
  all: ['epc', 'design-packages'] as const,
  lists: (projectId: string, taskDisciplineId: string) =>
    [...designPackageKeys.all, projectId, taskDisciplineId, 'list'] as const,
  details: (projectId: string, taskDisciplineId: string) =>
    [...designPackageKeys.all, projectId, taskDisciplineId, 'detail'] as const,
  detail: (
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
  ) =>
    [
      ...designPackageKeys.details(projectId, taskDisciplineId),
      packageId,
    ] as const,
  reviewContextSnapshot: (
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    reviewSessionId: string,
  ) =>
    [
      ...designPackageKeys.detail(projectId, taskDisciplineId, packageId),
      'review-context-snapshot',
      reviewSessionId,
    ] as const,
  sessionAttachments: (reviewSessionId: string) =>
    [...designPackageKeys.all, 'session-attachments', reviewSessionId] as const,
  snapshot: (reviewSessionId: string) =>
    [...designPackageKeys.all, 'snapshot', reviewSessionId] as const,
  dependencies: (
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
  ) =>
    [
      ...designPackageKeys.detail(projectId, taskDisciplineId, packageId),
      'dependencies',
    ] as const,
};

export function useDesignPackages(
  projectId: string,
  taskDisciplineId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: designPackageKeys.lists(projectId, taskDisciplineId),
    queryFn: () =>
      apiGet<DesignPackage[]>(
        designPackagesPath(projectId, taskDisciplineId),
      ),
    enabled: Boolean(projectId) && Boolean(taskDisciplineId) && enabled,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.some((pkg) => pkg.projectionPending)
        ? PROJECTION_POLL_MS
        : false,
  });
}

export function useDesignPackage(
  projectId: string,
  taskDisciplineId: string,
  packageId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: designPackageKeys.detail(projectId, taskDisciplineId, packageId),
    queryFn: () =>
      apiGet<DesignPackage>(
        designPackagesPath(projectId, taskDisciplineId, packageId),
      ),
    enabled:
      Boolean(projectId) &&
      Boolean(taskDisciplineId) &&
      Boolean(packageId) &&
      enabled,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.projectionPending ? PROJECTION_POLL_MS : false,
  });
}

export function useDesignPackageDependencies(
  projectId: string,
  taskDisciplineId: string,
  packageId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: designPackageKeys.dependencies(
      projectId,
      taskDisciplineId,
      packageId,
    ),
    queryFn: () =>
      apiGet<DesignPackageDependency[]>(
        designPackagesPath(projectId, taskDisciplineId, packageId, 'dependencies'),
      ),
    enabled:
      Boolean(projectId) &&
      Boolean(taskDisciplineId) &&
      Boolean(packageId) &&
      enabled,
    retry: false,
  });
}

function invalidatePackageQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  taskDisciplineId: string,
  packageId?: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: designPackageKeys.lists(projectId, taskDisciplineId),
  });
  if (packageId) {
    void queryClient.invalidateQueries({
      queryKey: designPackageKeys.detail(projectId, taskDisciplineId, packageId),
    });
    void queryClient.invalidateQueries({
      queryKey: epcWorkspaceKeys.reviewMode(packageId),
    });
  }
  void queryClient.invalidateQueries({
    queryKey: epcWorkspaceKeys.statusBoard(projectId),
  });
  void queryClient.invalidateQueries({
    queryKey: disciplineKeys.project(projectId),
  });
  void queryClient.invalidateQueries({
    queryKey: disciplineKeys.find(projectId, taskDisciplineId),
  });
  void queryClient.invalidateQueries({
    queryKey: engineeringDocumentKeys.lists(projectId, taskDisciplineId),
  });
}

export function useCreateDesignPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      body,
    }: {
      projectId: string;
      taskDisciplineId: string;
      body: CreateDesignPackageRequest;
    }) =>
      apiPost<DesignPackage>(
        designPackagesPath(projectId, taskDisciplineId),
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidatePackageQueries(
        queryClient,
        variables.projectId,
        variables.taskDisciplineId,
      );
    },
  });
}

export function useUpdateDesignPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      packageId,
      body,
    }: {
      projectId: string;
      taskDisciplineId: string;
      packageId: string;
      body: UpdateDesignPackageRequest;
    }) =>
      apiPatch<DesignPackage>(
        designPackagesPath(projectId, taskDisciplineId, packageId),
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidatePackageQueries(
        queryClient,
        variables.projectId,
        variables.taskDisciplineId,
        variables.packageId,
      );
    },
  });
}

export function useDeleteDesignPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      packageId,
    }: {
      projectId: string;
      taskDisciplineId: string;
      packageId: string;
    }) =>
      apiDelete<MessageResponse>(
        designPackagesPath(projectId, taskDisciplineId, packageId),
      ),
    onSuccess: (_data, variables) => {
      invalidatePackageQueries(
        queryClient,
        variables.projectId,
        variables.taskDisciplineId,
      );
    },
  });
}

export function useAddDesignPackageItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      packageId,
      body,
    }: {
      projectId: string;
      taskDisciplineId: string;
      packageId: string;
      body: AddDesignPackageItemRequest;
    }) =>
      apiPost<DesignPackageItem>(
        designPackagesPath(projectId, taskDisciplineId, packageId, 'items'),
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidatePackageQueries(
        queryClient,
        variables.projectId,
        variables.taskDisciplineId,
        variables.packageId,
      );
    },
  });
}

export function useRemoveDesignPackageItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      packageId,
      itemId,
    }: {
      projectId: string;
      taskDisciplineId: string;
      packageId: string;
      itemId: string;
    }) =>
      apiDelete<MessageResponse>(
        designPackagesPath(
          projectId,
          taskDisciplineId,
          packageId,
          `items/${itemId}`,
        ),
      ),
    onSuccess: (_data, variables) => {
      invalidatePackageQueries(
        queryClient,
        variables.projectId,
        variables.taskDisciplineId,
        variables.packageId,
      );
    },
  });
}

export function useAddDesignPackageDependency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      packageId,
      body,
    }: {
      projectId: string;
      taskDisciplineId: string;
      packageId: string;
      body: CreateDesignPackageDependencyRequest;
    }) =>
      apiPost<DesignPackageDependency>(
        designPackagesPath(projectId, taskDisciplineId, packageId, 'dependencies'),
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: designPackageKeys.dependencies(
          variables.projectId,
          variables.taskDisciplineId,
          variables.packageId,
        ),
      });
    },
  });
}

export function useRemoveDesignPackageDependency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      packageId,
      dependencyId,
    }: {
      projectId: string;
      taskDisciplineId: string;
      packageId: string;
      dependencyId: string;
    }) =>
      apiDelete<MessageResponse>(
        designPackagesPath(
          projectId,
          taskDisciplineId,
          packageId,
          `dependencies/${dependencyId}`,
        ),
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: designPackageKeys.dependencies(
          variables.projectId,
          variables.taskDisciplineId,
          variables.packageId,
        ),
      });
    },
  });
}

export function useSubmitPackageForReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      packageId,
      body = {},
    }: {
      projectId: string;
      taskDisciplineId: string;
      packageId: string;
      body?: SubmitPackageForReviewRequest;
    }) =>
      apiPost<WorkflowResultSnapshot>(
        designPackagesPath(
          projectId,
          taskDisciplineId,
          packageId,
          'submit-for-review',
        ),
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidatePackageQueries(
        queryClient,
        variables.projectId,
        variables.taskDisciplineId,
        variables.packageId,
      );
      void queryClient.invalidateQueries({
        queryKey: [...epcWorkspaceKeys.all, 'review-inbox'],
      });
    },
  });
}

export function useLockPackageEdvs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      packageId,
      body = {},
    }: {
      projectId: string;
      taskDisciplineId: string;
      packageId: string;
      body?: LockPackageEdvsRequest;
    }) =>
      apiPost<WorkflowResultSnapshot>(
        designPackagesPath(projectId, taskDisciplineId, packageId, 'lock-edvs'),
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidatePackageQueries(
        queryClient,
        variables.projectId,
        variables.taskDisciplineId,
        variables.packageId,
      );
    },
  });
}

export function useBatchApprovePackageEdvs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      packageId,
      body,
    }: {
      projectId: string;
      taskDisciplineId: string;
      packageId: string;
      body: BatchApproveEdvsRequest;
    }) =>
      apiPost<WorkflowResultSnapshot>(
        designPackagesPath(projectId, taskDisciplineId, packageId, 'batch-approve'),
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidatePackageQueries(
        queryClient,
        variables.projectId,
        variables.taskDisciplineId,
        variables.packageId,
      );
      void queryClient.invalidateQueries({
        queryKey: [...epcWorkspaceKeys.all, 'review-inbox'],
      });
    },
  });
}

export function useApproveReviewSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      packageId,
      reviewSessionId,
      body = {},
    }: {
      projectId: string;
      taskDisciplineId: string;
      packageId: string;
      reviewSessionId: string;
      body?: ApproveReviewSessionRequest;
    }) =>
      apiPost<WorkflowResultSnapshot>(
        designPackagesPath(
          projectId,
          taskDisciplineId,
          packageId,
          `review-sessions/${reviewSessionId}/approve`,
        ),
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidatePackageQueries(
        queryClient,
        variables.projectId,
        variables.taskDisciplineId,
        variables.packageId,
      );
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.reviewMode(variables.packageId),
      });
      void queryClient.invalidateQueries({
        queryKey: [...epcWorkspaceKeys.all, 'review-inbox'],
      });
    },
  });
}

export function useReturnPackageForRework() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskDisciplineId,
      packageId,
      body,
    }: {
      projectId: string;
      taskDisciplineId: string;
      packageId: string;
      body: ReturnPackageForReworkRequest;
    }) =>
      apiPost<WorkflowResultSnapshot>(
        designPackagesPath(projectId, taskDisciplineId, packageId, 'return-for-rework'),
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidatePackageQueries(
        queryClient,
        variables.projectId,
        variables.taskDisciplineId,
        variables.packageId,
      );
    },
  });
}

export function useReviewContextSnapshot(
  projectId: string,
  taskDisciplineId: string,
  packageId: string,
  reviewSessionId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: designPackageKeys.snapshot(reviewSessionId ?? ''),
    queryFn: () =>
      apiGet<ReviewContextSnapshot>(
        designPackagesPath(
          projectId,
          taskDisciplineId,
          packageId,
          `review-sessions/${reviewSessionId}/snapshot`,
        ),
      ),
    enabled:
      Boolean(projectId) &&
      Boolean(taskDisciplineId) &&
      Boolean(packageId) &&
      Boolean(reviewSessionId) &&
      enabled,
    retry: false,
  });
}

export function useCloseDesignPackage(
  projectId: string,
  taskDisciplineId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ packageId }: { packageId: string }) =>
      apiPost<DesignPackage>(
        designPackagesPath(projectId, taskDisciplineId, packageId, 'close'),
      ),
    onSuccess: (_data, variables) => {
      invalidatePackageQueries(
        queryClient,
        projectId,
        taskDisciplineId,
        variables.packageId,
      );
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.all,
      });
    },
  });
}

export function useReopenDesignPackage(
  projectId: string,
  taskDisciplineId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ packageId }: { packageId: string }) =>
      apiPost<DesignPackage>(
        designPackagesPath(projectId, taskDisciplineId, packageId, 'reopen'),
      ),
    onSuccess: (_data, variables) => {
      invalidatePackageQueries(
        queryClient,
        projectId,
        taskDisciplineId,
        variables.packageId,
      );
      void queryClient.invalidateQueries({
        queryKey: engineeringDocumentKeys.lists(projectId, taskDisciplineId),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.all,
      });
    },
  });
}

export function useCloseTaskDiscipline(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      disciplineId,
    }: {
      taskId: string;
      disciplineId: string;
    }) =>
      apiPost<TaskDiscipline>(
        `${scheduleBase(projectId)}/tasks/${taskId}/disciplines/${disciplineId}/close`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.disciplines(projectId, variables.taskId),
      });
      void queryClient.invalidateQueries({
        queryKey: disciplineKeys.project(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.all,
      });
    },
  });
}

export function useSessionAttachments(
  projectId: string,
  taskDisciplineId: string,
  packageId: string,
  reviewSessionId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: designPackageKeys.sessionAttachments(reviewSessionId),
    queryFn: () =>
      apiGet<ReviewSessionAttachment[]>(
        designPackagesPath(
          projectId,
          taskDisciplineId,
          packageId,
          `review-sessions/${reviewSessionId}/attachments`,
        ),
      ),
    enabled:
      Boolean(projectId) &&
      Boolean(taskDisciplineId) &&
      Boolean(packageId) &&
      Boolean(reviewSessionId) &&
      enabled,
    retry: false,
  });
}

export function useAddSessionAttachment(
  projectId: string,
  taskDisciplineId: string,
  packageId: string,
  reviewSessionId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: AddReviewSessionAttachmentRequest) =>
      apiPost<ReviewSessionAttachment>(
        designPackagesPath(
          projectId,
          taskDisciplineId,
          packageId,
          `review-sessions/${reviewSessionId}/attachments`,
        ),
        body,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: designPackageKeys.sessionAttachments(reviewSessionId),
      });
    },
  });
}

export function useConfigureRevisionTrigger(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      triggerId,
      body,
    }: {
      triggerId: string;
      body: ConfigureRevisionTriggerRequest;
    }) =>
      apiPatch<ExternalReviewTrigger>(
        `${projectPath(projectId)}/revision-triggers/${triggerId}/configure`,
        body,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.all,
      });
    },
  });
}
