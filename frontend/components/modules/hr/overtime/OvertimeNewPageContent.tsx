'use client';

import { useEffect } from 'react';
import { Alert, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import { useCurrentOvertimeSheet } from '@/lib/query/overtime';

/**
 * Opens (or creates) the current month overtime sheet, then redirects to detail.
 */
export default function OvertimeNewPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const currentQuery = useCurrentOvertimeSheet(true);

  useSetHeaderExtra(null);

  useEffect(() => {
    if (currentQuery.data?.id) {
      router.replace(`/hr/overtime/${currentQuery.data.id}`);
    }
  }, [currentQuery.data?.id, router]);

  return (
    <HrFormPageShell
      title={t('pages.hr.overtime.new')}
      description={t('pages.hr.overtime.newDescription')}
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
    >
      {currentQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            currentQuery.error instanceof ApiRequestError
              ? currentQuery.error.message
              : t('hr.messages.failedToOpenOvertimeSheet')
          }
        />
      ) : (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
          <Spin size="large" />
          <p className="m-0 text-sm text-[var(--color-text-secondary)]">
            {t('pages.hr.overtime.openingSheet')}
          </p>
        </div>
      )}
    </HrFormPageShell>
  );
}
