'use client';

import { useMemo } from 'react';
import { formatUserName } from '@/lib/utils/user-display';
import { useAuthStore } from '@/stores/auth.store';

export interface HrPdfContext {
  /** Company name for the PDF header band. */
  companyName: string | undefined;
  /** Name of the person generating the document. */
  preparedBy: string;
}

/**
 * Header context every HR detail-page PDF export needs: who is printing it and
 * which company they belong to.
 */
export function useHrPdfContext(): HrPdfContext {
  const user = useAuthStore((state) => state.user);

  return useMemo(
    () => ({
      companyName: user?.companyName,
      preparedBy: user ? formatUserName(user) : '-',
    }),
    [user],
  );
}
