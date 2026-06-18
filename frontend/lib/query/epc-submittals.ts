'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api/client';
import type {
  AddSubmittalItemsRequest,
  BatchAddSubmittalItemsRequest,
  BatchIssueSubmittalsRequest,
  CreateDesignSubmittalRequest,
  IssueSubmittalRequest,
  WorkflowResultSnapshot,
} from '@/lib/api/epc.types';
import type { Submittal } from '@/lib/api/project-management.types';
import { projectPath } from '@/lib/query/pm-query-utils';
import { submittalKeys } from '@/lib/query/submittals';
import { epcWorkspaceKeys } from '@/lib/query/epc-workspace';

export const epcSubmittalKeys = {
  all: ['epc', 'submittals'] as const,
};

function submittalsBase(projectId: string): string {
  return projectPath(projectId, 'submittals');
}

export function useCreateDesignSubmittal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateDesignSubmittalRequest;
    }) =>
      apiPost<Submittal>(`${submittalsBase(projectId)}/design-package`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.statusBoard(variables.projectId),
      });
    },
  });
}

export function useIssueSubmittal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      body = {},
    }: {
      projectId: string;
      submittalId: string;
      body?: IssueSubmittalRequest;
    }) =>
      apiPost<WorkflowResultSnapshot>(
        `${submittalsBase(projectId)}/${submittalId}/issue`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.detail(variables.projectId, variables.submittalId),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.statusBoard(variables.projectId),
      });
    },
  });
}

export function useAddSubmittalItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      body,
    }: {
      projectId: string;
      submittalId: string;
      body: AddSubmittalItemsRequest;
    }) =>
      apiPost<WorkflowResultSnapshot>(
        `${submittalsBase(projectId)}/${submittalId}/items`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.detail(variables.projectId, variables.submittalId),
      });
    },
  });
}

export function useBatchIssueSubmittals() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: BatchIssueSubmittalsRequest;
    }) =>
      apiPost<WorkflowResultSnapshot[]>(
        `${submittalsBase(projectId)}/batch-issue`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.statusBoard(variables.projectId),
      });
    },
  });
}

export function useBatchAddSubmittalItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: BatchAddSubmittalItemsRequest;
    }) =>
      apiPost<WorkflowResultSnapshot[]>(
        `${submittalsBase(projectId)}/batch-add-items`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: submittalKeys.lists(variables.projectId),
      });
    },
  });
}
