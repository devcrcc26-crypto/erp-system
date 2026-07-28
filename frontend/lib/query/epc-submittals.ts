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

function invalidateSubmittalDetail(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  submittalId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: submittalKeys.lists(projectId),
  });
  void queryClient.invalidateQueries({
    queryKey: submittalKeys.detail(projectId, submittalId),
  });
}

export function useApproveSubmittalSiteReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      reviewId,
    }: {
      projectId: string;
      submittalId: string;
      reviewId: string;
    }) =>
      apiPost<Submittal>(
        `${submittalsBase(projectId)}/${submittalId}/site-reviews/${reviewId}/approve`,
        {},
      ),
    onSuccess: (_data, variables) => {
      invalidateSubmittalDetail(
        queryClient,
        variables.projectId,
        variables.submittalId,
      );
    },
  });
}

export function useCommentSubmittalSiteReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      reviewId,
      comment,
    }: {
      projectId: string;
      submittalId: string;
      reviewId: string;
      comment: string;
    }) =>
      apiPost(
        `${submittalsBase(projectId)}/${submittalId}/site-reviews/${reviewId}/comment`,
        { comment },
      ),
    onSuccess: (_data, variables) => {
      invalidateSubmittalDetail(
        queryClient,
        variables.projectId,
        variables.submittalId,
      );
    },
  });
}

export function useRequestSubmittalSiteReReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      reviewId,
    }: {
      projectId: string;
      submittalId: string;
      reviewId: string;
    }) =>
      apiPost(
        `${submittalsBase(projectId)}/${submittalId}/site-reviews/${reviewId}/request-re-review`,
        {},
      ),
    onSuccess: (_data, variables) => {
      invalidateSubmittalDetail(
        queryClient,
        variables.projectId,
        variables.submittalId,
      );
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

export function useRecordSiteApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      body,
    }: {
      projectId: string;
      submittalId: string;
      body: { approvedAt?: string; notes?: string };
    }) =>
      apiPost<Submittal>(
        `${submittalsBase(projectId)}/${submittalId}/site-approve`,
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidateSubmittalDetail(
        queryClient,
        variables.projectId,
        variables.submittalId,
      );
    },
  });
}

export function useRecordSiteFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      body,
    }: {
      projectId: string;
      submittalId: string;
      body: { kind: 'COMMENT' | 'REJECTION'; comment: string };
    }) =>
      apiPost<Submittal>(
        `${submittalsBase(projectId)}/${submittalId}/site-feedback`,
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidateSubmittalDetail(
        queryClient,
        variables.projectId,
        variables.submittalId,
      );
    },
  });
}

export function useRecordConsultantApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      body,
    }: {
      projectId: string;
      submittalId: string;
      body: { approvedAt?: string; notes?: string };
    }) =>
      apiPost<Submittal>(
        `${submittalsBase(projectId)}/${submittalId}/consultant-approve`,
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidateSubmittalDetail(
        queryClient,
        variables.projectId,
        variables.submittalId,
      );
    },
  });
}

export function useRecordConsultantFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      body,
    }: {
      projectId: string;
      submittalId: string;
      body: { kind: 'COMMENT' | 'REJECTION'; comment: string };
    }) =>
      apiPost<Submittal>(
        `${submittalsBase(projectId)}/${submittalId}/consultant-feedback`,
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidateSubmittalDetail(
        queryClient,
        variables.projectId,
        variables.submittalId,
      );
    },
  });
}

export function useWithdrawSubmittal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      submittalId,
      body = {},
    }: {
      projectId: string;
      submittalId: string;
      body?: { reason?: string };
    }) =>
      apiPost<Submittal>(
        `${submittalsBase(projectId)}/${submittalId}/withdraw`,
        body,
      ),
    onSuccess: (_data, variables) => {
      invalidateSubmittalDetail(
        queryClient,
        variables.projectId,
        variables.submittalId,
      );
    },
  });
}
