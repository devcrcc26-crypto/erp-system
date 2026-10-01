'use client';

import { useMemo, useState } from 'react';
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
import type { OvertimeSheetStatus } from '@/lib/api/overtime.types';
import { useOnBehalfEligibleEmployees } from '@/lib/query/on-behalf';
import {
  useOpenOvertimeSheet,
  useOvertimeSheets,
} from '@/lib/query/overtime';
import { useCurrentUser } from '@/lib/query/profile';
import { disableFutureMonths } from '@/lib/utils/date-validation';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const EDITABLE_SHEET_STATUSES: OvertimeSheetStatus[] = ['DRAFT', 'RETURNED'];
const SUBMITTED_SHEET_STATUSES: OvertimeSheetStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
];

/**
 * Opens (or creates) an overtime sheet, then redirects to detail.
 * All users pick a month (past months allowed). On-behalf filers also pick an employee.
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

  const openMutation = useOpenOvertimeSheet();
  const [month, setMonth] = useState(() => dayjs().startOf('month'));

  const selectedMonth = month.month() + 1;
  const selectedYear = month.year();
  // Scope to the person this sheet belongs to. Without this, hr.view users
  // hit the company-wide list and get a false "already have a sheet" alert
  // for someone else's month before picking an on-behalf employee.
  const targetEmployeeId =
    onBehalf.employeeId ?? currentUser.data?.id ?? undefined;

  const existingSheetQuery = useOvertimeSheets(
    {
      page: 1,
      limit: 1,
      month: selectedMonth,
      year: selectedYear,
      ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
    },
    eligibleResolved && Boolean(targetEmployeeId),
  );

  const existingSheet = useMemo(() => {
    const sheet = existingSheetQuery.data?.data?.[0] ?? null;
    if (!sheet || sheet.status === 'CANCELLED') {
      return null;
    }
    return sheet;
  }, [existingSheetQuery.data?.data]);

  const existingKind = useMemo((): 'draft' | 'submitted' | null => {
    if (!existingSheet) {
      return null;
    }
    if (EDITABLE_SHEET_STATUSES.includes(existingSheet.status)) {
      return 'draft';
    }
    if (SUBMITTED_SHEET_STATUSES.includes(existingSheet.status)) {
      return 'submitted';
    }
    return null;
  }, [existingSheet]);

  useSetHeaderExtra(null);

  async function handleOpen(): Promise<void> {
    try {
      const sheet = await openMutation.mutateAsync({
        ...onBehalf.payload,
        month: selectedMonth,
        year: selectedYear,
      });
      router.replace(`/hr/overtime/${sheet.id}`);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.failedToOpenOvertimeSheet'), messageApi);
    }
  }

  function goToExistingSheet(): void {
    if (!existingSheet?.id) {
      return;
    }
    router.push(`/hr/overtime/${existingSheet.id}`);
  }

  const title = onBehalf.employee
    ? t('hr.onBehalf.overtimeTitle', {
        name: formatOnBehalfEmployeeName(onBehalf.employee),
      })
    : t('pages.hr.overtime.new');

  const periodLabel = month.format('MMMM YYYY');

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
      ) : existingSheetQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            existingSheetQuery.error instanceof ApiRequestError
              ? existingSheetQuery.error.message
              : t('hr.messages.failedToOpenOvertimeSheet')
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {hasOnBehalfAccess ? <OnBehalfSection state={onBehalf} /> : null}

          <FormLayout
            variant="pro"
            title={t('pages.hr.overtime.selectMonth')}
            description={t('pages.hr.overtime.selectMonthDescription')}
          >
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
              {existingKind === 'submitted' ? (
                <Button type="primary" onClick={goToExistingSheet}>
                  {t('pages.hr.overtime.openExistingSheet')}
                </Button>
              ) : existingKind === 'draft' ? (
                <Button type="primary" onClick={goToExistingSheet}>
                  {t('pages.hr.overtime.continueDraft')}
                </Button>
              ) : (
                <Button
                  type="primary"
                  loading={openMutation.isPending}
                  onClick={() => void handleOpen()}
                >
                  {t('hr.onBehalf.openSheet')}
                </Button>
              )}
            </div>

            {existingKind === 'submitted' && existingSheet ? (
              <Alert
                type="warning"
                showIcon
                className="mt-3"
                title={t('pages.hr.overtime.existingSubmittedSheetAlert', {
                  period: periodLabel,
                })}
                action={
                  <Button size="small" onClick={goToExistingSheet}>
                    {t('pages.hr.overtime.openExistingSheet')}
                  </Button>
                }
              />
            ) : null}

            {existingKind === 'draft' && existingSheet ? (
              <Alert
                type="info"
                showIcon
                className="mt-3"
                title={t('pages.hr.overtime.existingDraftSheetAlert', {
                  period: periodLabel,
                })}
                action={
                  <Button size="small" onClick={goToExistingSheet}>
                    {t('pages.hr.overtime.continueDraft')}
                  </Button>
                }
              />
            ) : null}
          </FormLayout>
        </div>
      )}
    </HrFormPageShell>
  );
}
