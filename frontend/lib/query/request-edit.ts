'use client';

import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Matches approvalKeys.all. Not imported from approvals.ts, which pulls in
 * attendance queries and would create import cycles for module hooks.
 */
const APPROVALS_QUERY_ROOT = ['approvals'] as const;

/**
 * Shared cache handling for employee edits of DRAFT / RETURNED requests.
 * Saving a RETURNED record resubmits it on the server (status → SUBMITTED),
 * so the detail cache flips optimistically and approvals/drafts refetch.
 */

interface WithStatus {
  status: string;
}

export interface RequestEditContext<T> {
  previous: T | undefined;
}

/** onMutate: show RETURNED → SUBMITTED immediately; keeps the old value for rollback. */
export async function applyOptimisticRequestEdit<T extends WithStatus>(
  queryClient: QueryClient,
  detailKey: QueryKey,
): Promise<RequestEditContext<T>> {
  await queryClient.cancelQueries({ queryKey: detailKey });
  const previous = queryClient.getQueryData<T>(detailKey);
  if (previous?.status === 'RETURNED') {
    queryClient.setQueryData<T>(detailKey, { ...previous, status: 'SUBMITTED' });
  }
  return { previous };
}

/** onError: restore the detail cache captured in onMutate. */
export function rollbackRequestEdit<T>(
  queryClient: QueryClient,
  detailKey: QueryKey,
  context: RequestEditContext<T> | undefined,
): void {
  if (context?.previous !== undefined) {
    queryClient.setQueryData(detailKey, context.previous);
  }
}

/** onSuccess: approvals inbox, approval detail and drafts reflect the save. */
export function invalidateAfterRequestEdit(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: APPROVALS_QUERY_ROOT });
  void queryClient.invalidateQueries({ queryKey: ['drafts'] });
}
