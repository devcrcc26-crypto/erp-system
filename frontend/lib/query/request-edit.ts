'use client';

import type { QueryClient } from '@tanstack/react-query';

/**
 * Matches approvalKeys.all. Not imported from approvals.ts, which pulls in
 * attendance queries and would create import cycles for module hooks.
 */
const APPROVALS_QUERY_ROOT = ['approvals'] as const;

/**
 * Employee edits of DRAFT / RETURNED requests save fields only (status is
 * unchanged; a returned request is resubmitted separately from Approvals).
 * The approval card mirrors the edited values, so approvals and drafts refetch.
 */
export function invalidateAfterRequestEdit(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: APPROVALS_QUERY_ROOT });
  void queryClient.invalidateQueries({ queryKey: ['drafts'] });
}
