'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import {
  formatOnBehalfEmployeeName,
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import { useOnBehalfEligibleEmployees } from '@/lib/query/on-behalf';
import {
  useCurrentOvertimeSheet,
  useOpenOvertimeSheet,
} from '@/lib/query/overtime';
import { useCurrentUser } from '@/lib/query/profile';
import { disableFutureMonths } from '@/lib/utils/date-validation';
import { notifyApiError } from '@/lib/utils/notify-api-error';

/**
 * Opens (or creates) an overtime sheet, then redirects to detail.
 * Without on-behalf access: the caller's current month, automatically.
 * With on-behalf access: pick the month and optionally the employee first.
 */
export default function OvertimeNewPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const onBehalf = useOnBehalf('OVERTIME_APPLICATION');
  const eligibleQuery = useOnBehalfEligibleEmployees(
    currentUser.data?.id,
    currentUser.data?.companyId,
  );
  const eligibleResolved = Boolean(currentUser.data?.id) && !eligibleQuery.isLoading;
  const hasOnBehalfAccess = (eligibleQuery.data?.length ?? 0) > 0;

  const currentQuery = useCurrentOvertimeSheet(
    eligibleResolved && !hasOnBehalfAccess,
  );
  const openMutation = useOpenOvertimeSheet();
  const [month, setMonth] = useState(() => dayjs().startOf('month'));

  useSetHeaderExtra(null);

  useEffect(() => {
    if (currentQuery.data?.id) {
      router.replace(`/hr/overtime/${currentQuery.data.id}`);
    }
  }, [currentQuery.data?.id, router]);

  async function handleOpen(): Promise<void> {
    try {
      const sheet = await openMutation.mutateAsync({
        ...onBehalf.payload,
        month: month.month() + 1,
        year: month.year(),
      });
      router.replace(`/hr/overtime/${sheet.id}`);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.failedToOpenOvertimeSheet'), messageApi);
    }
  }

  const title = onBehalf.employee
    ? t('hr.onBehalf.overtimeTitle', {
        name: formatOnBehalfEmployeeName(onBehalf.employee),
      })
    : t('pages.hr.overtime.new');

  const opening = (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
      <Spin size="large" />
      <p className="m-0 text-sm text-[var(--color-text-secondary)]">
        {t('pages.hr.overtime.openingSheet')}
      </p>
    </div>
  );

  return (
    <HrFormPageShell
      title={title}
      description={
        hasOnBehalfAccess
          ? t('hr.onBehalf.overtimeDescription')
          : t('pages.hr.overtime.newDescription')
      }
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
    >
      {!eligibleResolved ? (
        opening
      ) : hasOnBehalfAccess ? (
        <div className="flex flex-col gap-4">
          <OnBehalfSection state={onBehalf} />
          <FormLayout variant="pro" title={t('hr.onBehalf.month')}>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Typography.Text className="mb-1 block text-sm font-medium">
                  {t('hr.onBehalf.month')}
                </Typography.Text>
                <DatePicker
                  picker="month"
                  allowClear={false}
                  disabledDate={disableFutureMonths}
                  value={month}
                  onChange={(value) => {
                    if (value) {
                      setMonth(value.startOf('month'));
                    }
                  }}
                />
              </div>
              <Button
                type="primary"
                loading={openMutation.isPending}
                onClick={() => void handleOpen()}
              >
                {t('hr.onBehalf.openSheet')}
              </Button>
            </div>
          </FormLayout>
        </div>
      ) : currentQuery.isError ? (
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
        opening
      )}
    </HrFormPageShell>
  );
}
