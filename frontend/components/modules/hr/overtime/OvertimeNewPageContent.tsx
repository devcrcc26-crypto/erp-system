'use client';

import { useEffect } from 'react';
import { Alert, Button, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import { useCurrentOvertimeSheet } from '@/lib/query/overtime';
import { tokens } from '@/lib/theme/tokens';

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
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="m-0 text-xl font-semibold tracking-tight"
            style={{
              color: tokens.colorTextPrimary,
              fontFamily: tokens.fontFamily,
            }}
          >
            {t('pages.hr.overtime.new')}
          </h1>
          <p
            className="mb-0 mt-1 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            {t('pages.hr.overtime.myListDescription')}
          </p>
        </div>
        <Button
          onClick={() => router.push('/hr/overtime')}
          className="shrink-0"
          style={{ borderRadius: 0 }}
        >
          {t('common.cancel')}
        </Button>
      </div>

      {currentQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            currentQuery.error instanceof ApiRequestError
              ? currentQuery.error.message
              : t('hr.messages.failedToOpenOvertimeSheet')
          }
          action={
            <Button
              onClick={() => router.push('/hr/overtime')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      ) : (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
          <Spin size="large" />
          <p
            className="m-0 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            {t('pages.hr.overtime.openingSheet')}
          </p>
        </div>
      )}
    </div>
  );
}
