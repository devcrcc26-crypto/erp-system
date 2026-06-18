'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPatch, apiPost } from '@/lib/api/client';
import type {
  AddReviewCommentRequest,
  TransitionReviewCommentRequest,
  VerifyReviewCommentRequest,
  WorkflowResultSnapshot,
} from '@/lib/api/epc.types';
import { epcWorkspaceKeys } from '@/lib/query/epc-workspace';

export const reviewCommentKeys = {
  all: ['epc', 'review-comments'] as const,
};

export function useAddReviewComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: AddReviewCommentRequest) =>
      apiPost<WorkflowResultSnapshot>('/review-comments', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.myComments(),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.reviewInbox(),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.all,
      });
    },
  });
}

export function useTransitionReviewComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      commentId,
      body,
    }: {
      commentId: string;
      body: TransitionReviewCommentRequest;
    }) =>
      apiPatch<WorkflowResultSnapshot>(
        `/review-comments/${commentId}/status`,
        body,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.myComments(),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.all,
      });
    },
  });
}

export function useVerifyReviewComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      commentId,
      body = {},
    }: {
      commentId: string;
      body?: VerifyReviewCommentRequest;
    }) =>
      apiPost<WorkflowResultSnapshot>(
        `/review-comments/${commentId}/verify`,
        body,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.myComments(),
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.all,
      });
    },
  });
}
