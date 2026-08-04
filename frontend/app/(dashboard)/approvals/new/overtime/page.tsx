'use client';

import { useEffect } from 'react';
import { Alert, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { ApiRequestError } from '@/lib/api/errors';
import { useCurrentOvertimeSheet } from '@/lib/query/overtime';

/**
 * Opens (or creates) the current month overtime sheet, then redirects to detail.
 */
export default function NewOvertimePage(): React.ReactNode {
  const router = useRouter();
  const currentQuery = useCurrentOvertimeSheet(true);

  useEffect(() => {
    if (currentQuery.data?.id) {
      router.replace(`/hr/overtime/${currentQuery.data.id}`);
    }
  }, [currentQuery.data?.id, router]);

  if (currentQuery.isError) {
    return (
      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] p-8">
        <Alert
          type="error"
          showIcon
          title={
            currentQuery.error instanceof ApiRequestError
              ? currentQuery.error.message
              : 'Failed to open overtime sheet'
          }
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] p-8 flex min-h-[240px] flex-col items-center justify-center gap-3">
      <Spin size="large" />
      <span className="text-sm text-[var(--color-text-secondary)]">
        Opening this month&apos;s overtime sheet…
      </span>
    </div>
  );
}
