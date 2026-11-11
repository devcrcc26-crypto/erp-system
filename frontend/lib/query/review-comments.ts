'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import type {
  AddReviewCommentRequest,
  ReviewCommentDetail,
  TransitionReviewCommentRequest,
  UpdateReviewCommentRequest,
  VerifyReviewCommentRequest,
  WorkflowResultSnapshot,
} from '@/lib/api/epc.types';
import { epcWorkspaceKeys } from '@/lib/query/epc-workspace';

export const reviewCommentKeys = {
  all: ['epc', 'review-comments'] as const,
  detail: (commentId: string) =>
    [...reviewCommentKeys.all, 'detail', commentId] as const,
};

export function useReviewComment(commentId: string, enabled = true) {
  return useQuery({
    queryKey: reviewCommentKeys.detail(commentId),
    queryFn: () => apiGet<ReviewCommentDetail>(`/review-comments/${commentId}`),
    enabled: Boolean(commentId) && enabled,
    retry: false,
  });
}

export function useAddReviewComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: AddReviewCommentRequest) =>
      apiPost<WorkflowResultSnapshot>('/review-comments', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...epcWorkspaceKeys.all, 'my-comments'],
      });
      void queryClient.invalidateQueries({
        queryKey: [...epcWorkspaceKeys.all, 'review-inbox'],
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
        queryKey: [...epcWorkspaceKeys.all, 'my-comments'],
      });
      void queryClient.invalidateQueries({
        queryKey: [...epcWorkspaceKeys.all, 'review-inbox'],
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
        queryKey: [...epcWorkspaceKeys.all, 'my-comments'],
      });
      void queryClient.invalidateQueries({
        queryKey: [...epcWorkspaceKeys.all, 'review-inbox'],
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.all,
      });
    },
  });
}

export function useDeleteReviewComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentId: string) =>
      apiDelete<WorkflowResultSnapshot>(`/review-comments/${commentId}`),
    onSuccess: (_data, commentId) => {
      void queryClient.invalidateQueries({
        queryKey: reviewCommentKeys.detail(commentId),
      });
      void queryClient.invalidateQueries({
        queryKey: [...epcWorkspaceKeys.all, 'my-comments'],
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.all,
      });
    },
  });
}

export function useUpdateReviewComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      commentId,
      body,
    }: {
      commentId: string;
      body: UpdateReviewCommentRequest;
    }) =>
      apiPatch<WorkflowResultSnapshot>(`/review-comments/${commentId}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: reviewCommentKeys.detail(variables.commentId),
      });
      void queryClient.invalidateQueries({
        queryKey: [...epcWorkspaceKeys.all, 'my-comments'],
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.all,
      });
    },
  });
}
