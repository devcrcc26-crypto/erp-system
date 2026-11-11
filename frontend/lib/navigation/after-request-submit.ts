import type { QueryClient } from '@tanstack/react-query';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

/**
 * After a request is submitted, refresh approval/module caches then send the
 * employee to their requests list (not a detail page that may still be stale).
 */
export async function navigateAfterRequestSubmit(input: {
  queryClient: QueryClient;
  router: AppRouterInstance;
  invalidateKeys?: ReadonlyArray<readonly unknown[]>;
}): Promise<void> {
  const jobs: Array<Promise<unknown>> = [
    input.queryClient.invalidateQueries({ queryKey: ['approvals'] }),
  ];
  for (const key of input.invalidateKeys ?? []) {
    jobs.push(input.queryClient.invalidateQueries({ queryKey: [...key] }));
  }
  await Promise.all(jobs);
  input.router.push('/approvals');
}
