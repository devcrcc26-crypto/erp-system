'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api/client';
import type {
  BatchReviewApproveRequest,
  BatchReviewReturnRequest,
  WorkflowResultSnapshot,
} from '@/lib/api/epc.types';
import { designPackageKeys } from '@/lib/query/design-packages';
import { epcWorkspaceKeys } from '@/lib/query/epc-workspace';

export const reviewBatchKeys = {
  all: ['epc', 'review-batch'] as const,
};

export function useBatchReviewApprove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BatchReviewApproveRequest) =>
      apiPost<WorkflowResultSnapshot>('/review/batch-approve', body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: designPackageKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.reviewMode(variables.designPackageId),
      });
      void queryClient.invalidateQueries({
        queryKey: [...epcWorkspaceKeys.all, 'review-inbox'],
      });
    },
  });
}

export function useBatchReviewReturn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BatchReviewReturnRequest) =>
      apiPost<WorkflowResultSnapshot>('/review/batch-return', body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: designPackageKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: epcWorkspaceKeys.reviewMode(variables.designPackageId),
      });
      void queryClient.invalidateQueries({
        queryKey: [...epcWorkspaceKeys.all, 'my-comments'],
      });
    },
  });
}
